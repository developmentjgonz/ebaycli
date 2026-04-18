using System.Net;
using System.Security.Cryptography;
using System.Threading.RateLimiting;
using System.Text;
using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Contracts;
using EbayStoreManager.Api.Data;
using EbayStoreManager.Api.Infrastructure;
using EbayStoreManager.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<EbayIntegrationOptions>(builder.Configuration.GetSection(EbayIntegrationOptions.SectionName));
builder.Services.Configure<EbayNotificationOptions>(builder.Configuration.GetSection(EbayNotificationOptions.SectionName));
builder.Services.Configure<OperationalOptions>(builder.Configuration.GetSection(OperationalOptions.SectionName));
builder.Services.Configure<LegalOptions>(builder.Configuration.GetSection(LegalOptions.SectionName));

builder.Services.AddDataProtection();
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient(nameof(EbayMarketplaceGateway));
builder.Services.AddHttpLogging(options =>
{
    options.LoggingFields = HttpLoggingFields.RequestMethod |
                            HttpLoggingFields.RequestPath |
                            HttpLoggingFields.ResponseStatusCode |
                            HttpLoggingFields.Duration;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.ContentType = "application/problem+json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            title = "rate_limit_exceeded",
            detail = "Too many requests. Slow down and try again shortly.",
            status = StatusCodes.Status429TooManyRequests
        }, cancellationToken);
    };

    options.AddPolicy("anonymous-auth-bootstrap", httpContext =>
    {
        var operational = httpContext.RequestServices.GetRequiredService<IOptions<OperationalOptions>>().Value;
        var permitLimit = Math.Max(1, operational.RateLimiting.AnonymousPermitLimit);
        var window = TimeSpan.FromSeconds(Math.Max(1, operational.RateLimiting.AnonymousWindowSeconds));
        var partitionKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});

builder.Services.AddDbContext<AppDbContext>((serviceProvider, options) =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    var sqlServer = configuration.GetConnectionString("SqlServer");
    if (!string.IsNullOrWhiteSpace(sqlServer))
    {
        options.UseSqlServer(sqlServer, sqlOptions => sqlOptions.EnableRetryOnFailure());
        return;
    }

    var sqlite = configuration.GetConnectionString("Sqlite");
    if (string.IsNullOrWhiteSpace(sqlite))
    {
        var home = Environment.GetEnvironmentVariable("HOME");
        if (!string.IsNullOrWhiteSpace(home))
        {
            var dataDirectory = Path.Combine(home, "data");
            Directory.CreateDirectory(dataDirectory);
            sqlite = $"Data Source={Path.Combine(dataDirectory, "ebay-store-manager.db")}";
        }
        else
        {
            sqlite = "Data Source=ebay-store-manager.db";
        }
    }

    options.UseSqlite(sqlite);
});

builder.Services.AddScoped<EbayEnvironmentResolver>();
builder.Services.AddScoped<IEbayMarketplaceGateway, EbayMarketplaceGateway>();
builder.Services.AddScoped<TokenCipher>();
builder.Services.AddScoped<LocalEbayAuthService>();
builder.Services.AddScoped<LocalEbayStoreService>();
builder.Services.AddScoped<AppDbInitializer>();
builder.Services.AddHostedService<AuthStateMaintenanceService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpLogging();
app.UseRateLimiter();
app.UseSwagger();
app.UseSwaggerUI();

using (var scope = app.Services.CreateScope())
{
    var initializer = scope.ServiceProvider.GetRequiredService<AppDbInitializer>();
    await initializer.InitializeAsync(CancellationToken.None);
}

app.MapGet("/", () => Results.Redirect("/swagger"));
app.MapGet("/health", () => TypedResults.Ok(new { status = "ok", utc = DateTimeOffset.UtcNow }));
app.MapGet("/ready", () => TypedResults.Ok(new { status = "ready", utc = DateTimeOffset.UtcNow }));
app.MapGet("/llms.txt", () => Results.Text(BuildLlmsText(), "text/plain", Encoding.UTF8));
app.MapGet("/privacy", (IOptions<LegalOptions> options) => Results.Text(BuildPrivacyPolicy(options.Value), "text/html", Encoding.UTF8));
app.MapGet("/privacy-policy", (IOptions<LegalOptions> options) => Results.Text(BuildPrivacyPolicy(options.Value), "text/html", Encoding.UTF8));
app.MapGet("/auth/success", (HttpRequest request, IOptions<LegalOptions> options) => Results.Text(BuildAuthLandingPage("Authorization complete", "You can return to the CLI now. If the CLI is waiting in manual paste mode, paste the full URL from this page back into the terminal.", request, options.Value), "text/html", Encoding.UTF8));
app.MapGet("/auth/declined", (HttpRequest request, IOptions<LegalOptions> options) => Results.Text(BuildAuthLandingPage("Authorization declined", "The eBay consent flow was declined or canceled. You can close this page and retry the login command from the CLI when ready.", request, options.Value), "text/html", Encoding.UTF8));
app.MapGet("/notifications/ebay/marketplace-account-deletion", HandleMarketplaceAccountDeletionChallenge);
app.MapPost("/notifications/ebay/marketplace-account-deletion", HandleMarketplaceAccountDeletionNotificationAsync);

var local = app.MapGroup("/api/local/ebay");

local.MapPost("/authorize/start", async Task<IResult> (
    LocalEbayAuthStartRequest request,
    LocalEbayAuthService localAuth,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localAuth.BeginAuthorizationAsync(request, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_authorize_start_failed", exception.Message);
    }
}).RequireRateLimiting("anonymous-auth-bootstrap");

local.MapPost("/authorize/exchange", async Task<IResult> (
    LocalEbayAuthExchangeRequest request,
    LocalEbayAuthService localAuth,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localAuth.ExchangeAuthorizationAsync(request, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_authorize_exchange_failed", exception.Message);
    }
}).RequireRateLimiting("anonymous-auth-bootstrap");

local.MapPost("/refresh", async Task<IResult> (
    LocalEbayRefreshRequest request,
    LocalEbayAuthService localAuth,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localAuth.RefreshAsync(request, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_refresh_failed", exception.Message);
    }
});

local.MapPost("/status", async Task<IResult> (
    LocalDoctorRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.GetStatusAsync(request.Session, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_status_failed", exception.Message);
    }
});

local.MapPost("/setup/doctor", async Task<IResult> (
    LocalDoctorRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.RunDoctorAsync(request.Session, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_doctor_failed", exception.Message);
    }
});

local.MapPost("/setup/policies/sync", async Task<IResult> (
    LocalPolicySyncRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.SyncPoliciesAsync(request.Session, request, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_policy_sync_failed", exception.Message);
    }
});

local.MapPost("/setup/policies/opt-in", async Task<IResult> (
    LocalPolicyProgramOptInRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.OptInToPolicyProgramAsync(request.Session, request.ProgramType, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_policy_opt_in_failed", exception.Message);
    }
});

local.MapPost("/setup/location", async Task<IResult> (
    LocalLocationUpsertRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.UpsertLocationAsync(request.Session, request, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_location_upsert_failed", exception.Message);
    }
});

local.MapPost("/listings/list", async Task<IResult> (
    LocalListListingsRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.ListListingsAsync(request.Session, request.Status, request.Page, request.Limit, request.Days, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listings_list_failed", exception.Message);
    }
});

local.MapPost("/listings/get", async Task<IResult> (
    LocalListingReferenceRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.GetListingAsync(request.Session, request.Reference, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_get_failed", exception.Message);
    }
});

local.MapPost("/listings/create/plan", async Task<IResult> (
    LocalCreateListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.PlanCreateAsync(request.Session, request.Listing, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_plan_create_failed", exception.Message);
    }
});

local.MapPost("/listings/create/apply", async Task<IResult> (
    LocalCreateListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.CreateListingAsync(request.Session, request.Listing, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_create_failed", exception.Message);
    }
});

local.MapPost("/listings/update/plan", async Task<IResult> (
    LocalUpdateListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.PlanUpdateAsync(request.Session, request.Reference, request.Listing, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_plan_update_failed", exception.Message);
    }
});

local.MapPost("/listings/update/apply", async Task<IResult> (
    LocalUpdateListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.UpdateListingAsync(request.Session, request.Reference, request.Listing, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_update_failed", exception.Message);
    }
});

local.MapPost("/listings/end/plan", async Task<IResult> (
    LocalEndListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.PlanEndAsync(request.Session, request.Reference, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_plan_end_failed", exception.Message);
    }
});

local.MapPost("/listings/end/apply", async Task<IResult> (
    LocalEndListingRequest request,
    LocalEbayStoreService localStore,
    CancellationToken cancellationToken) =>
{
    try
    {
        return TypedResults.Ok(await localStore.EndListingAsync(request.Session, request.Reference, cancellationToken));
    }
    catch (InvalidOperationException exception)
    {
        return HttpResults.Problem(400, "local_ebay_listing_end_failed", exception.Message);
    }
});

app.MapGet("/oauth/ebay/callback", async Task<IResult> (
    string code,
    string state,
    LocalEbayAuthService localAuth,
    CancellationToken cancellationToken) =>
{
    if (!await localAuth.HasPendingStateAsync(state, cancellationToken))
    {
        return HttpResults.Problem(400, "local_ebay_authorize_exchange_failed", "Unknown or expired local eBay OAuth state.");
    }

    var completed = await localAuth.CompleteAuthorizationAsync(state, code, cancellationToken);
    return Results.Redirect(AppendQueryString(completed.CallbackUrl, new Dictionary<string, string>
    {
        ["state"] = state,
        ["code"] = completed.ExchangeCode
    }));
});

app.Run();

static IResult HandleMarketplaceAccountDeletionChallenge(HttpContext context)
{
    var request = context.Request;
    var challengeCode = request.Query["challenge_code"].ToString();
    if (string.IsNullOrWhiteSpace(challengeCode))
    {
        return HttpResults.Problem(400, "missing_challenge_code", "The 'challenge_code' query string parameter is required.");
    }

    var notificationOptions = context.RequestServices.GetRequiredService<IOptions<EbayNotificationOptions>>().Value;
    if (string.IsNullOrWhiteSpace(notificationOptions.VerificationToken))
    {
        return HttpResults.Problem(500, "notification_verification_token_missing", "The eBay notification verification token is not configured.");
    }

    var endpoint = BuildAbsoluteUrl(request, notificationOptions.MarketplaceAccountDeletionPath);
    var challengeResponse = ComputeChallengeResponse(challengeCode, notificationOptions.VerificationToken, endpoint);
    return TypedResults.Ok(new EbayChallengeResponse(challengeResponse));
}

static async Task<IResult> HandleMarketplaceAccountDeletionNotificationAsync(
    HttpRequest request,
    ILogger<Program> logger,
    CancellationToken cancellationToken)
{
    using var reader = new StreamReader(request.Body);
    var payload = await reader.ReadToEndAsync(cancellationToken);
    logger.LogInformation("Received eBay marketplace account deletion notification: {Payload}", payload);
    return Results.NoContent();
}

static string BuildAbsoluteUrl(HttpRequest request, string path)
{
    var baseUri = $"{request.Scheme}://{request.Host}";
    return $"{baseUri}{path}";
}

static string ComputeChallengeResponse(string challengeCode, string verificationToken, string endpoint)
{
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{challengeCode}{verificationToken}{endpoint}"));
    return Convert.ToHexString(bytes).ToLowerInvariant();
}

static string AppendQueryString(string url, IReadOnlyDictionary<string, string> values)
{
    var separator = url.Contains('?') ? '&' : '?';
    var suffix = string.Join("&", values.Select(pair => $"{WebUtility.UrlEncode(pair.Key)}={WebUtility.UrlEncode(pair.Value)}"));
    return $"{url}{separator}{suffix}";
}

static string BuildPrivacyPolicy(LegalOptions options)
{
    return $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{WebUtility.HtmlEncode(options.CompanyName)}} Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 52rem; padding: 0 1rem; line-height: 1.6; color: #1f2937; }
    h1, h2 { line-height: 1.25; }
    code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <h1>{{WebUtility.HtmlEncode(options.CompanyName)}} Privacy Policy</h1>
  <p><strong>Effective date:</strong> {{WebUtility.HtmlEncode(options.EffectiveDate)}}</p>
  <p>This application is an optional backend companion for a self-managed eBay CLI. It may host privacy/auth landing pages, support optional token handling, and expose server-side endpoints required by eBay for users who self-host it.</p>

  <h2>Information processed</h2>
  <p>When you connect an eBay account, the service may process eBay account identifiers, OAuth token material, listing metadata, seller policy information, and temporary authorization-state records needed to complete login or execute a requested operation.</p>

  <h2>How data is used</h2>
  <p>Data is used only to complete eBay authorization, refresh access when needed, execute seller-requested eBay API calls, support diagnostics, and maintain service reliability and security.</p>

  <h2>How data is stored</h2>
  <p>The CLI stores the eBay session locally on the user's machine. If this backend is used, it may process temporary authorization-state records, optional server-side token material, and operational logs needed to complete the hosted flow.</p>

  <h2>Data retention</h2>
  <p>Temporary authorization-state records are cleaned up automatically after they expire. Operational logs and configuration are retained only as long as needed for support, security, and service operation.</p>

  <h2>Third-party services</h2>
  <p>This product interacts with eBay APIs and may be hosted on third-party infrastructure providers used to run the service. eBay data remains subject to eBay platform rules and the permissions granted by the user.</p>

  <h2>Your choices</h2>
  <p>You can revoke this application's access through your eBay account settings. You can also remove the local CLI profile or disconnect the local session.</p>

  <h2>Contact</h2>
  <p>For privacy questions, contact <a href="mailto:{{WebUtility.HtmlEncode(options.ContactEmail)}}">{{WebUtility.HtmlEncode(options.ContactEmail)}}</a>.</p>
  <p>Website: <a href="{{WebUtility.HtmlEncode(options.WebsiteUrl)}}">{{WebUtility.HtmlEncode(options.WebsiteUrl)}}</a></p>
</body>
</html>
""";
}

static string BuildAuthLandingPage(string title, string message, HttpRequest request, LegalOptions options)
{
    var fullUrl = $"{request.Scheme}://{request.Host}{request.Path}{request.QueryString}";
    var queryItems = request.Query.Count == 0
        ? string.Empty
        : string.Join("", request.Query.Select(pair =>
            $"<li><strong>{WebUtility.HtmlEncode(pair.Key)}</strong>: {WebUtility.HtmlEncode(pair.Value.ToString())}</li>"));
    var querySection = string.IsNullOrWhiteSpace(queryItems)
        ? string.Empty
        : $"""
  <h2>Return data</h2>
  <p>If your CLI is waiting for manual completion, copy and paste the full URL below back into the terminal.</p>
  <p><code>{WebUtility.HtmlEncode(fullUrl)}</code></p>
  <ul>{queryItems}</ul>
""";

    return $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{WebUtility.HtmlEncode(title)}} · {{WebUtility.HtmlEncode(options.CompanyName)}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 48rem; padding: 0 1rem; line-height: 1.6; color: #111827; }
    .card { border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.25rem; background: #ffffff; }
    code { display: inline-block; background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 0.25rem; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>{{WebUtility.HtmlEncode(title)}}</h1>
    <p>{{WebUtility.HtmlEncode(message)}}</p>
    {{querySection}}
    <p>Privacy: <a href="{{WebUtility.HtmlEncode(options.WebsiteUrl)}}/privacy">{{WebUtility.HtmlEncode(options.WebsiteUrl)}}/privacy</a></p>
  </div>
</body>
</html>
""";
}

static string BuildLlmsText()
{
    return """
# ebaycli

ebaycli is a self-managed local eBay CLI.

- every user provides their own eBay app credentials
- the CLI stores the eBay OAuth session locally
- the CLI owns listing/setup workflow logic
- this backend is an optional reference implementation for privacy/auth landing pages and other server-side eBay surfaces

## Project status

- Self-managed auth is the only public CLI mode
- No backend user-account or store-owner model in the active product path
- Supports both eBay listing models:
  - Trading/classic listings for active and sold reads, legacy listing detail, and legacy update/end flows
  - Inventory API listings for create flows and Inventory-backed update/end flows
- Designed for human CLI use and LLM/agent use

## Start here

- Public API/docs entrypoint: /swagger
- Health: /health
- Privacy: /privacy
- Auth success landing page: /auth/success
- Auth declined landing page: /auth/declined
- Main human-readable docs live in the repository README
- Prefer the local CLI guide surface for exact agent workflows

## Commands

- cd cli && node dist/index.js guide --json
  - Return machine-readable project guidance for agents
- cd cli && node dist/index.js config auth --client-id ... --client-secret ... --runame ...
  - Configure the local CLI profile with the user's own eBay app credentials
- cd cli && node dist/index.js auth login --environment production
  - Start local eBay OAuth and store the resulting session in the selected CLI profile
- cd cli && node dist/index.js auth status --json
  - Show the connected eBay account
- cd cli && node dist/index.js setup doctor --json
  - Show seller readiness, business policy availability, and location readiness
- cd cli && node dist/index.js listings list --json
  - List active listings
- cd cli && node dist/index.js listings list --status SOLD --days 30 --json
  - List recently sold listings
- cd cli && node dist/index.js listings get <reference> --json
  - Fetch normalized listing detail
- cd cli && node dist/index.js listings pull <reference> --out <file>
  - Export a normalized listing spec
- cd cli && node dist/index.js listings create --file <draft.yaml>
  - Plan a listing create
- cd cli && node dist/index.js listings update <reference> --file <patch.yaml>
  - Plan a listing update
- cd cli && node dist/index.js listings end <reference>
  - Plan a listing end

## Agent guidance

Agents should prefer the built-in guide surface over repository inference:

- cd cli && node dist/index.js guide --json
- cd cli && node dist/index.js guide capabilities --json
- cd cli && node dist/index.js guide workflows --json
- cd cli && node dist/index.js guide listing-spec --json
- cd cli && node dist/index.js guide agent-notes --json

Use those commands before drafting listing files or deciding whether a listing operation will route through Trading or Inventory APIs.
""";
}

public partial class Program;
