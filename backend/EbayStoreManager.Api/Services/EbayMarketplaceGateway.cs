using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using EbayStoreManager.Api.Configuration;
using EbayStoreManager.Api.Domain;
using Microsoft.Extensions.Options;

namespace EbayStoreManager.Api.Services;

public sealed class EbayMarketplaceGateway(
    IHttpClientFactory httpClientFactory,
    IOptions<OperationalOptions> operationalOptions,
    ILogger<EbayMarketplaceGateway> logger) : IEbayMarketplaceGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string TradingCompatibilityLevel = "1231";
    private static readonly IReadOnlyDictionary<string, string> MarketplaceLocales = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["EBAY_US"] = "en-US",
        ["EBAY_GB"] = "en-GB",
        ["EBAY_AU"] = "en-AU",
        ["EBAY_CA"] = "en-CA",
        ["EBAY_DE"] = "de-DE",
        ["EBAY_FR"] = "fr-FR",
        ["EBAY_IT"] = "it-IT",
        ["EBAY_ES"] = "es-ES"
    };
    private static readonly IReadOnlyDictionary<string, int> MarketplaceSiteIds = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        ["EBAY_US"] = 0,
        ["EBAY_GB"] = 3,
        ["EBAY_AU"] = 15,
        ["EBAY_CA"] = 2,
        ["EBAY_DE"] = 77,
        ["EBAY_FR"] = 71,
        ["EBAY_IT"] = 101,
        ["EBAY_ES"] = 186
    };

    public async Task<JsonObject> ExchangeAuthorizationCodeAsync(
        EbayEnvironmentDescriptor environment,
        string code,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{environment.ApiBaseUrl}/identity/v1/oauth2/token");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{environment.ClientId}:{environment.ClientSecret}")));
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = environment.RuName
        });

        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> RefreshAccessTokenAsync(
        EbayEnvironmentDescriptor environment,
        string refreshToken,
        string[] scopes,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{environment.ApiBaseUrl}/identity/v1/oauth2/token");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{environment.ClientId}:{environment.ClientSecret}")));
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
            ["scope"] = string.Join(' ', scopes)
        });

        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetUserAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.IdentityBaseUrl}/commerce/identity/v1/user/", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetPrivilegesAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/account/v1/privilege", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetPaymentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/account/v1/payment_policy?marketplace_id={Uri.EscapeDataString(marketplaceId)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetFulfillmentPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/account/v1/fulfillment_policy?marketplace_id={Uri.EscapeDataString(marketplaceId)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetReturnPoliciesAsync(EbayEnvironmentDescriptor environment, string accessToken, string marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/account/v1/return_policy?marketplace_id={Uri.EscapeDataString(marketplaceId)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task CreatePaymentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/account/v1/payment_policy", accessToken, payload);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task CreateFulfillmentPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/account/v1/fulfillment_policy", accessToken, payload);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task CreateReturnPolicyAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/account/v1/return_policy", accessToken, payload);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> OptInToProgramAsync(EbayEnvironmentDescriptor environment, string accessToken, string programType, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/account/v1/program/opt_in", accessToken);
        request.Content = JsonContent.Create(new JsonObject
        {
            ["programType"] = programType
        }, options: JsonOptions);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetLocationsAsync(EbayEnvironmentDescriptor environment, string accessToken, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/inventory/v1/location", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task CreateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/inventory/v1/location/{Uri.EscapeDataString(merchantLocationKey)}", accessToken, payload, locale, marketplaceId);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task UpdateInventoryLocationAsync(EbayEnvironmentDescriptor environment, string accessToken, string merchantLocationKey, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Put, $"{environment.ApiBaseUrl}/sell/inventory/v1/location/{Uri.EscapeDataString(merchantLocationKey)}", accessToken, payload, locale, marketplaceId);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/inventory/v1/inventory_item/{Uri.EscapeDataString(sku)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetInventoryItemsAsync(EbayEnvironmentDescriptor environment, string accessToken, int limit, int offset, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/inventory/v1/inventory_item?limit={limit}&offset={offset}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task UpsertInventoryItemAsync(EbayEnvironmentDescriptor environment, string accessToken, string sku, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Put, $"{environment.ApiBaseUrl}/sell/inventory/v1/inventory_item/{Uri.EscapeDataString(sku)}", accessToken, payload, locale, marketplaceId);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetOffersAsync(EbayEnvironmentDescriptor environment, string accessToken, string? sku, CancellationToken cancellationToken)
    {
        var url = $"{environment.ApiBaseUrl}/sell/inventory/v1/offer";
        if (!string.IsNullOrWhiteSpace(sku))
        {
            url = $"{url}?sku={Uri.EscapeDataString(sku)}";
        }

        using var request = Authorized(HttpMethod.Get, url, accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/inventory/v1/offer/{Uri.EscapeDataString(offerId)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> CreateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/inventory/v1/offer", accessToken, payload, locale, marketplaceId);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task UpdateOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, JsonObject payload, string? locale, string? marketplaceId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Put, $"{environment.ApiBaseUrl}/sell/inventory/v1/offer/{Uri.EscapeDataString(offerId)}", accessToken, payload, locale, marketplaceId);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> PublishOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/inventory/v1/offer/{Uri.EscapeDataString(offerId)}/publish", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task WithdrawOfferAsync(EbayEnvironmentDescriptor environment, string accessToken, string offerId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/inventory/v1/offer/{Uri.EscapeDataString(offerId)}/withdraw", accessToken);
        await SendNoContentOrJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> BulkUpdatePriceQuantityAsync(EbayEnvironmentDescriptor environment, string accessToken, JsonObject payload, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.ApiBaseUrl}/sell/inventory/v1/bulk_update_price_quantity", accessToken, payload);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> GetListingAsync(EbayEnvironmentDescriptor environment, string accessToken, string listingId, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Get, $"{environment.ApiBaseUrl}/sell/inventory/v1/listing/{Uri.EscapeDataString(listingId)}", accessToken);
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> CreateImageFromUrlAsync(EbayEnvironmentDescriptor environment, string accessToken, string sourceUrl, CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.MediaBaseUrl}/commerce/media/v1_beta/image/create_image_from_url", accessToken);
        request.Content = JsonContent.Create(new { imageUrl = sourceUrl });
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<JsonObject> CreateImageFromFileAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        byte[] content,
        string fileName,
        string contentType,
        CancellationToken cancellationToken)
    {
        using var request = Authorized(HttpMethod.Post, $"{environment.MediaBaseUrl}/commerce/media/v1_beta/image/create_image_from_file", accessToken);
        using var multipart = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(content);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        multipart.Add(fileContent, "image", fileName);
        request.Content = multipart;
        return await SendJsonAsync(request, cancellationToken);
    }

    public async Task<IReadOnlyList<JsonObject>> GetActiveListingsAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        int pageNumber,
        int entriesPerPage,
        CancellationToken cancellationToken)
    {
        var siteId = MarketplaceSiteIds.TryGetValue(marketplaceId, out var mapped) ? mapped : 0;
        var requestXml = $$"""
            <?xml version="1.0" encoding="utf-8"?>
            <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <ActiveList>
                <Include>true</Include>
                <Pagination>
                  <EntriesPerPage>{{entriesPerPage}}</EntriesPerPage>
                  <PageNumber>{{pageNumber}}</PageNumber>
                </Pagination>
              </ActiveList>
              <DetailLevel>ReturnAll</DetailLevel>
            </GetMyeBaySellingRequest>
            """;

        using var request = new HttpRequestMessage(HttpMethod.Post, environment.TradingBaseUrl);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-IAF-TOKEN", accessToken);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-CALL-NAME", "GetMyeBaySelling");
        request.Headers.TryAddWithoutValidation("X-EBAY-API-COMPATIBILITY-LEVEL", TradingCompatibilityLevel);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-SITEID", siteId.ToString());
        request.Content = new StringContent(requestXml, Encoding.UTF8, "text/xml");

        var xml = await SendXmlAsync(request, cancellationToken);
        return ParseTradingList(xml, marketplaceId, "ActiveList");
    }

    public async Task<IReadOnlyList<JsonObject>> GetSoldListingsAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        int durationInDays,
        int pageNumber,
        int entriesPerPage,
        CancellationToken cancellationToken)
    {
        var siteId = MarketplaceSiteIds.TryGetValue(marketplaceId, out var mapped) ? mapped : 0;
        var requestXml = $$"""
            <?xml version="1.0" encoding="utf-8"?>
            <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <SoldList>
                <Include>true</Include>
                <DurationInDays>{{durationInDays}}</DurationInDays>
                <Pagination>
                  <EntriesPerPage>{{entriesPerPage}}</EntriesPerPage>
                  <PageNumber>{{pageNumber}}</PageNumber>
                </Pagination>
              </SoldList>
              <DetailLevel>ReturnAll</DetailLevel>
            </GetMyeBaySellingRequest>
            """;

        using var request = new HttpRequestMessage(HttpMethod.Post, environment.TradingBaseUrl);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-IAF-TOKEN", accessToken);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-CALL-NAME", "GetMyeBaySelling");
        request.Headers.TryAddWithoutValidation("X-EBAY-API-COMPATIBILITY-LEVEL", TradingCompatibilityLevel);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-SITEID", siteId.ToString());
        request.Content = new StringContent(requestXml, Encoding.UTF8, "text/xml");

        var xml = await SendXmlAsync(request, cancellationToken);
        return ParseTradingList(xml, marketplaceId, "SoldList");
    }

    public async Task<JsonObject> GetLegacyListingAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        string listingId,
        CancellationToken cancellationToken)
    {
        var siteId = MarketplaceSiteIds.TryGetValue(marketplaceId, out var mapped) ? mapped : 0;
        var requestXml = $$"""
            <?xml version="1.0" encoding="utf-8"?>
            <GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
              <ItemID>{{listingId}}</ItemID>
              <IncludeItemSpecifics>true</IncludeItemSpecifics>
              <DetailLevel>ReturnAll</DetailLevel>
            </GetItemRequest>
            """;

        using var request = new HttpRequestMessage(HttpMethod.Post, environment.TradingBaseUrl);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-IAF-TOKEN", accessToken);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-CALL-NAME", "GetItem");
        request.Headers.TryAddWithoutValidation("X-EBAY-API-COMPATIBILITY-LEVEL", TradingCompatibilityLevel);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-SITEID", siteId.ToString());
        request.Content = new StringContent(requestXml, Encoding.UTF8, "text/xml");

        var xml = await SendXmlAsync(request, cancellationToken);
        return ParseLegacyListing(xml, marketplaceId);
    }

    public async Task<JsonObject> ReviseInventoryStatusAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        string listingId,
        string? sku,
        decimal? priceValue,
        string? priceCurrency,
        int? quantity,
        CancellationToken cancellationToken)
    {
        var ns = XNamespace.Get("urn:ebay:apis:eBLBaseComponents");
        var inventoryStatus = new XElement(ns + "InventoryStatus",
            new XElement(ns + "ItemID", listingId));

        if (!string.IsNullOrWhiteSpace(sku))
        {
            inventoryStatus.Add(new XElement(ns + "SKU", sku));
        }

        if (priceValue.HasValue)
        {
            inventoryStatus.Add(new XElement(ns + "StartPrice",
                new XAttribute("currencyID", priceCurrency ?? "USD"),
                priceValue.Value));
        }

        if (quantity.HasValue)
        {
            inventoryStatus.Add(new XElement(ns + "Quantity", quantity.Value));
        }

        var document = new XDocument(
            new XElement(ns + "ReviseInventoryStatusRequest",
                inventoryStatus));

        var xml = await SendTradingCallAsync(environment, accessToken, marketplaceId, "ReviseInventoryStatus", document, cancellationToken);
        return ParseTradingResponseSummary(xml, "ReviseInventoryStatus");
    }

    public async Task<JsonObject> ReviseFixedPriceItemAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        JsonObject payload,
        CancellationToken cancellationToken)
    {
        var ns = XNamespace.Get("urn:ebay:apis:eBLBaseComponents");
        var item = new XElement(ns + "Item",
            new XElement(ns + "ItemID", payload["listingId"]?.GetValue<string>() ?? throw new InvalidOperationException("Missing listingId.")));

        if (!string.IsNullOrWhiteSpace(payload["sku"]?.GetValue<string>()))
        {
            item.Add(new XElement(ns + "SKU", payload["sku"]!.GetValue<string>()));
        }

        AddOptionalElement(item, ns, "Title", payload["title"]?.GetValue<string>());
        AddOptionalElement(item, ns, "Description", payload["description"]?.GetValue<string>());
        AddOptionalElement(item, ns, "ConditionID", payload["conditionId"]?.GetValue<string>());

        if (!string.IsNullOrWhiteSpace(payload["categoryId"]?.GetValue<string>()))
        {
            item.Add(new XElement(ns + "PrimaryCategory",
                new XElement(ns + "CategoryID", payload["categoryId"]!.GetValue<string>())));
        }

        if (payload["priceValue"]?.GetValue<decimal?>() is { } priceValue)
        {
            item.Add(new XElement(ns + "StartPrice",
                new XAttribute("currencyID", payload["priceCurrency"]?.GetValue<string>() ?? "USD"),
                priceValue));
        }

        if (payload["quantity"]?.GetValue<int?>() is { } quantity)
        {
            item.Add(new XElement(ns + "Quantity", quantity));
        }

        if (payload["pictureUrls"] is JsonArray pictureUrls && pictureUrls.Count > 0)
        {
            item.Add(new XElement(ns + "PictureDetails",
                pictureUrls
                    .Select(url => url?.GetValue<string>())
                    .Where(url => !string.IsNullOrWhiteSpace(url))
                    .Select(url => new XElement(ns + "PictureURL", url!))));
        }

        if (payload["itemSpecifics"] is JsonObject specifics && specifics.Count > 0)
        {
            var itemSpecifics = new XElement(ns + "ItemSpecifics");
            foreach (var kvp in specifics)
            {
                if (kvp.Value is not JsonArray values || values.Count == 0)
                {
                    continue;
                }

                itemSpecifics.Add(new XElement(ns + "NameValueList",
                    new XElement(ns + "Name", kvp.Key),
                    values.Select(value => new XElement(ns + "Value", value?.GetValue<string>() ?? string.Empty))));
            }

            if (itemSpecifics.HasElements)
            {
                item.Add(itemSpecifics);
            }
        }

        var document = new XDocument(
            new XElement(ns + "ReviseFixedPriceItemRequest",
                item));

        var xml = await SendTradingCallAsync(environment, accessToken, marketplaceId, "ReviseFixedPriceItem", document, cancellationToken);
        return ParseTradingResponseSummary(xml, "ReviseFixedPriceItem");
    }

    public async Task<JsonObject> EndFixedPriceItemAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        string listingId,
        string endingReason,
        CancellationToken cancellationToken)
    {
        var ns = XNamespace.Get("urn:ebay:apis:eBLBaseComponents");
        var document = new XDocument(
            new XElement(ns + "EndFixedPriceItemRequest",
                new XElement(ns + "EndingReason", endingReason),
                new XElement(ns + "ItemID", listingId)));

        var xml = await SendTradingCallAsync(environment, accessToken, marketplaceId, "EndFixedPriceItem", document, cancellationToken);
        return ParseTradingResponseSummary(xml, "EndFixedPriceItem");
    }

    private HttpRequestMessage Authorized(HttpMethod method, string url, string accessToken, JsonObject? body = null, string? locale = null, string? marketplaceId = null)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: JsonOptions);
            var contentLanguage = ResolveContentLanguage(locale, marketplaceId);
            if (!string.IsNullOrWhiteSpace(contentLanguage))
            {
                request.Content.Headers.TryAddWithoutValidation("Content-Language", contentLanguage);
            }
        }

        return request;
    }

    private static string? ResolveContentLanguage(string? locale, string? marketplaceId)
    {
        if (!string.IsNullOrWhiteSpace(locale))
        {
            return locale;
        }

        if (!string.IsNullOrWhiteSpace(marketplaceId) && MarketplaceLocales.TryGetValue(marketplaceId, out var mapped))
        {
            return mapped;
        }

        return null;
    }

    private async Task<string> SendXmlAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await SendWithRetryAsync(request, cancellationToken);
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private async Task<string> SendTradingCallAsync(
        EbayEnvironmentDescriptor environment,
        string accessToken,
        string marketplaceId,
        string callName,
        XDocument document,
        CancellationToken cancellationToken)
    {
        var siteId = MarketplaceSiteIds.TryGetValue(marketplaceId, out var mapped) ? mapped : 0;
        using var request = new HttpRequestMessage(HttpMethod.Post, environment.TradingBaseUrl);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-IAF-TOKEN", accessToken);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-CALL-NAME", callName);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-COMPATIBILITY-LEVEL", TradingCompatibilityLevel);
        request.Headers.TryAddWithoutValidation("X-EBAY-API-SITEID", siteId.ToString());
        request.Content = new StringContent(document.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");
        return await SendXmlAsync(request, cancellationToken);
    }

    private static IReadOnlyList<JsonObject> ParseTradingList(string xml, string marketplaceId, string listName)
    {
        var document = XDocument.Parse(xml);
        var ns = document.Root?.Name.Namespace ?? XNamespace.None;
        EnsureTradingSuccess(document, ns);

        var list = document
            .Descendants(ns + listName)
            .Descendants(ns + "Item")
            .Select(item =>
            {
                var orderTransaction = item.Ancestors(ns + "OrderTransaction").FirstOrDefault();
                var transaction = item.Element(ns + "SellingStatus")?.Element(ns + "TransactionArray")?.Element(ns + "Transaction")
                                  ?? item.Element(ns + "OrderTransactionArray")?.Element(ns + "OrderTransaction")?.Element(ns + "Transaction")
                                  ?? orderTransaction?.Element(ns + "Transaction");
                var soldTime = transaction?.Element(ns + "CreatedDate")?.Value
                               ?? item.Element(ns + "SellingStatus")?.Element(ns + "SaleTime")?.Value;

                return new JsonObject
                {
                    ["sku"] = item.Element(ns + "SKU")?.Value ?? item.Element(ns + "ItemID")?.Value ?? string.Empty,
                    ["marketplaceId"] = marketplaceId,
                    ["offerId"] = null,
                    ["listingId"] = item.Element(ns + "ItemID")?.Value,
                    ["status"] = item.Element(ns + "SellingStatus")?.Element(ns + "ListingStatus")?.Value
                                 ?? (string.Equals(listName, "SoldList", StringComparison.OrdinalIgnoreCase) ? "SOLD" : "ACTIVE"),
                    ["title"] = item.Element(ns + "Title")?.Value,
                    ["priceValue"] = ParseDecimal(
                        transaction?.Element(ns + "TransactionPrice")?.Value
                        ?? item.Element(ns + "SellingStatus")?.Element(ns + "CurrentPrice")?.Value),
                    ["priceCurrency"] = transaction?.Element(ns + "TransactionPrice")?.Attribute("currencyID")?.Value
                                        ?? item.Element(ns + "SellingStatus")?.Element(ns + "CurrentPrice")?.Attribute("currencyID")?.Value,
                    ["availableQuantity"] = ParseInt(item.Element(ns + "QuantityAvailable")?.Value ?? item.Element(ns + "Quantity")?.Value),
                    ["quantitySold"] = ParseInt(transaction?.Element(ns + "QuantityPurchased")?.Value ?? item.Element(ns + "SellingStatus")?.Element(ns + "QuantitySold")?.Value),
                    ["soldAtUtc"] = ParseDateTimeOffset(soldTime),
                    ["buyerUsername"] = transaction?.Element(ns + "Buyer")?.Element(ns + "UserID")?.Value,
                    ["source"] = "TRADING",
                    ["listingUrl"] = item.Element(ns + "ListingDetails")?.Element(ns + "ViewItemURL")?.Value
                };
            })
            .ToList();

        return list;
    }

    private static JsonObject ParseLegacyListing(string xml, string marketplaceId)
    {
        var document = XDocument.Parse(xml);
        var ns = document.Root?.Name.Namespace ?? XNamespace.None;
        EnsureTradingSuccess(document, ns);

        var item = document.Descendants(ns + "Item").FirstOrDefault()
                   ?? throw new InvalidOperationException("Trading API GetItem response did not include an Item.");

        var specifics = new JsonObject();
        foreach (var nameValue in item.Element(ns + "ItemSpecifics")?.Elements(ns + "NameValueList") ?? [])
        {
            var name = nameValue.Element(ns + "Name")?.Value;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            specifics[name] = new JsonArray(nameValue.Elements(ns + "Value").Select(x => (JsonNode?)x.Value).ToArray());
        }

        var pictureUrls = item.Element(ns + "PictureDetails")?.Elements(ns + "PictureURL").Select(x => (JsonNode?)x.Value).ToArray() ?? [];

        return new JsonObject
        {
            ["source"] = "TRADING",
            ["marketplaceId"] = marketplaceId,
            ["listingId"] = item.Element(ns + "ItemID")?.Value,
            ["sku"] = item.Element(ns + "SKU")?.Value,
            ["status"] = item.Element(ns + "SellingStatus")?.Element(ns + "ListingStatus")?.Value,
            ["title"] = item.Element(ns + "Title")?.Value,
            ["description"] = item.Element(ns + "Description")?.Value,
            ["categoryId"] = item.Element(ns + "PrimaryCategory")?.Element(ns + "CategoryID")?.Value,
            ["categoryName"] = item.Element(ns + "PrimaryCategory")?.Element(ns + "CategoryName")?.Value,
            ["conditionId"] = item.Element(ns + "ConditionID")?.Value,
            ["conditionDisplayName"] = item.Element(ns + "ConditionDisplayName")?.Value,
            ["listingType"] = item.Element(ns + "ListingType")?.Value,
            ["startPrice"] = ParseDecimal(item.Element(ns + "StartPrice")?.Value),
            ["priceCurrency"] = item.Element(ns + "StartPrice")?.Attribute("currencyID")?.Value,
            ["quantity"] = ParseInt(item.Element(ns + "Quantity")?.Value),
            ["quantityAvailable"] = ParseInt(item.Element(ns + "QuantityAvailable")?.Value),
            ["quantitySold"] = ParseInt(item.Element(ns + "SellingStatus")?.Element(ns + "QuantitySold")?.Value),
            ["startTimeUtc"] = ParseDateTimeOffset(item.Element(ns + "ListingDetails")?.Element(ns + "StartTime")?.Value),
            ["endTimeUtc"] = ParseDateTimeOffset(item.Element(ns + "ListingDetails")?.Element(ns + "EndTime")?.Value),
            ["viewItemUrl"] = item.Element(ns + "ListingDetails")?.Element(ns + "ViewItemURL")?.Value,
            ["bestOfferEnabled"] = item.Element(ns + "BestOfferDetails")?.Element(ns + "BestOfferEnabled")?.Value,
            ["listingDuration"] = item.Element(ns + "ListingDuration")?.Value,
            ["location"] = item.Element(ns + "Location")?.Value,
            ["postalCode"] = item.Element(ns + "PostalCode")?.Value,
            ["country"] = item.Element(ns + "Country")?.Value,
            ["dispatchTimeMax"] = ParseInt(item.Element(ns + "DispatchTimeMax")?.Value),
            ["pictureUrls"] = new JsonArray(pictureUrls),
            ["itemSpecifics"] = specifics
        };
    }

    private static JsonObject ParseTradingResponseSummary(string xml, string callName)
    {
        var document = XDocument.Parse(xml);
        var ns = document.Root?.Name.Namespace ?? XNamespace.None;
        EnsureTradingSuccess(document, ns);

        return new JsonObject
        {
            ["callName"] = callName,
            ["ack"] = document.Descendants(ns + "Ack").FirstOrDefault()?.Value,
            ["itemId"] = document.Descendants(ns + "ItemID").FirstOrDefault()?.Value,
            ["sku"] = document.Descendants(ns + "SKU").FirstOrDefault()?.Value,
            ["endTimeUtc"] = ParseDateTimeOffset(document.Descendants(ns + "EndTime").FirstOrDefault()?.Value),
            ["startTimeUtc"] = ParseDateTimeOffset(document.Descendants(ns + "StartTime").FirstOrDefault()?.Value)
        };
    }

    private static void AddOptionalElement(XElement parent, XNamespace ns, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            parent.Add(new XElement(ns + name, value));
        }
    }

    private static void EnsureTradingSuccess(XDocument document, XNamespace ns)
    {
        var ack = document.Descendants(ns + "Ack").FirstOrDefault()?.Value;
        if (!string.Equals(ack, "Success", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(ack, "Warning", StringComparison.OrdinalIgnoreCase))
        {
            var errorMessage = document.Descendants(ns + "LongMessage").FirstOrDefault()?.Value
                               ?? document.Descendants(ns + "ShortMessage").FirstOrDefault()?.Value
                               ?? "Trading API request failed.";
            throw new InvalidOperationException($"eBay Trading API request failed: {errorMessage}");
        }
    }

    private static decimal? ParseDecimal(string? value)
        => decimal.TryParse(value, out var parsed) ? parsed : null;

    private static int? ParseInt(string? value)
        => int.TryParse(value, out var parsed) ? parsed : null;

    private static string? ParseDateTimeOffset(string? value)
        => DateTimeOffset.TryParse(value, out var parsed) ? parsed.UtcDateTime.ToString("O") : null;

    private async Task<JsonObject> SendJsonAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await SendWithRetryAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        return JsonNode.Parse(payload)?.AsObject() ?? new JsonObject();
    }

    private async Task SendNoContentOrJsonAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await SendWithRetryAsync(request, cancellationToken);
        await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private async Task<HttpResponseMessage> SendWithRetryAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var maxAttempts = Math.Max(1, operationalOptions.Value.EbayRetries.MaxAttempts);
        var baseDelayMs = Math.Max(1, operationalOptions.Value.EbayRetries.BaseDelayMilliseconds);
        var client = httpClientFactory.CreateClient(nameof(EbayMarketplaceGateway));

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            using var clonedRequest = await CloneRequestAsync(request, cancellationToken);
            try
            {
                var response = await client.SendAsync(clonedRequest, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return response;
                }

                var payload = await response.Content.ReadAsStringAsync(cancellationToken);
                if (attempt >= maxAttempts || !ShouldRetry(response.StatusCode))
                {
                    logger.LogWarning(
                        "eBay API request failed without further retry. Method={Method} Url={Url} StatusCode={StatusCode} Attempt={Attempt} Payload={Payload}",
                        request.Method,
                        request.RequestUri,
                        (int)response.StatusCode,
                        attempt,
                        payload);
                    response.Dispose();
                    throw new EbayApiException(
                        response.StatusCode,
                        payload,
                        $"eBay API request failed ({(int)response.StatusCode}).");
                }

                logger.LogWarning(
                    "Transient eBay API failure. Retrying. Method={Method} Url={Url} StatusCode={StatusCode} Attempt={Attempt}",
                    request.Method,
                    request.RequestUri,
                    (int)response.StatusCode,
                    attempt);
                response.Dispose();
            }
            catch (Exception exception) when (attempt < maxAttempts && exception is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(
                    exception,
                    "Transient transport failure calling eBay. Retrying. Method={Method} Url={Url} Attempt={Attempt}",
                    request.Method,
                    request.RequestUri,
                    attempt);
            }

            await Task.Delay(TimeSpan.FromMilliseconds(baseDelayMs * attempt), cancellationToken);
        }

        throw new InvalidOperationException("eBay API request failed after retries.");
    }

    private static bool ShouldRetry(HttpStatusCode statusCode)
        => statusCode == HttpStatusCode.TooManyRequests || (int)statusCode >= 500;

    private static async Task<HttpRequestMessage> CloneRequestAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri);

        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (request.Content is not null)
        {
            var bytes = await request.Content.ReadAsByteArrayAsync(cancellationToken);
            var contentClone = new ByteArrayContent(bytes);
            foreach (var header in request.Content.Headers)
            {
                contentClone.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }

            clone.Content = contentClone;
        }

        return clone;
    }
}
