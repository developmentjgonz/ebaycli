import { Command } from "commander";

import {
  createLocalListing,
  createLocalListingPlan,
  createOrSetLocalLocation,
  endLocalListing,
  endLocalListingPlan,
  getLocalConnectionStatus,
  getLocalListing,
  listLocalListings,
  pullLocalListing,
  runLocalDoctor,
  optInLocalPolicyProgram,
  syncLocalPolicies,
  updateLocalListing,
  updateLocalListingPlan,
  verifyLocalListingCreate
} from "./runtime.js";
import {
  buildBootstrapGuidance,
  clearLocalEbaySession,
  requireConfiguredProfile,
  resolveProfile,
  upsertProfile
} from "./profile-config.js";
import { parseListingPatchFile, parseListingSpecFile } from "./listing-files.js";
import { authenticateWithEbayLocally, normalizeRelayUrl } from "./oauth.js";
import type { LocalEbaySession } from "./types.js";
import { APP_VERSION } from "./constants.js";
import { AppError } from "./errors.js";
import { getGuide } from "./guide.js";
import { buildCliLlmsText } from "./llms.js";
import {
  renderConnectionStatus,
  renderDoctorReport,
  renderListings,
  renderMutationPlan,
  renderResult
} from "./output.js";

interface GlobalOptions {
  profile: string;
  json?: boolean;
}

type WritePath = "INVENTORY" | "TRADING";

function getGlobalOptions(command: Command): GlobalOptions {
  if (typeof command.optsWithGlobals === "function") {
    return (command.optsWithGlobals() as GlobalOptions | undefined) ?? { profile: "default", json: false };
  }

  if (command.parent && typeof command.parent.optsWithGlobals === "function") {
    return (command.parent.optsWithGlobals() as GlobalOptions | undefined) ?? { profile: "default", json: false };
  }

  return ((command.opts() as Partial<GlobalOptions>) ?? { profile: "default", json: false }) as GlobalOptions;
}

export function redactSessionForOutput(session: LocalEbaySession) {
  return {
    ...session,
    accessToken: "***redacted***",
    refreshToken: "***redacted***"
  };
}

export function redactProfileForOutput(profile: ReturnType<typeof resolveProfile>) {
  return {
    ...profile,
    ...(profile.ebaySession
      ? {
          ebaySession: redactSessionForOutput(profile.ebaySession)
        }
      : {})
  };
}

export function createCli(): Command {
  const program = new Command();
  program
    .name("ebay")
    .description("Backend-relay local eBay CLI for connecting a seller account and managing listings")
    .version(APP_VERSION)
    .option("-p, --profile <name>", "local CLI profile name", "default")
    .option("--json", "emit machine-readable JSON", false);

  program
    .command("guide")
    .description("Return self-describing guidance for humans and agents")
    .argument("[topic]", "overview, capabilities, workflows, listing-spec, or agent-notes")
    .action((topic, _options, command: Command) => {
      const global = getGlobalOptions(command);
      renderResult(getGuide(topic), Boolean(global.json));
    });

  program
    .command("llms")
    .description("Return the CLI's static agent-discovery metadata")
    .action((_, command: Command) => {
      const global = getGlobalOptions(command);
      const content = buildCliLlmsText();
      renderResult(global.json ? { format: "llms.txt", content } : content, Boolean(global.json));
    });

  program
    .command("status")
    .description("Return a combined operational status snapshot for the selected profile")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const [connection, doctor] = await Promise.all([
        getLocalConnectionStatus(profile),
        runLocalDoctor(profile)
      ]);
      renderResult(
        {
          profile: global.profile,
          configuration: redactProfileForOutput(profile),
          connection,
          doctor
        },
        Boolean(global.json)
      );
    });

  const config = program.command("config").description("Configure this CLI profile and backend relay");
  config
    .command("set")
    .description("Set the production backend relay URL used for eBay OAuth callback and token exchange")
    .option("--backend-url <url>")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = upsertProfile({
        name: global.profile,
        ...(options.backendUrl ? { backendBaseUrl: normalizeRelayUrl(options.backendUrl) } : {})
      });
      renderResult(redactProfileForOutput(profile), Boolean(global.json));
    });

  config
    .command("status")
    .description("Show profile configuration for this CLI profile")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      renderResult(buildConfigStatusForOutput(resolveProfile(global.profile)), Boolean(global.json));
    });

  const auth = program.command("auth").description("Connect eBay locally and inspect the current local session");
  auth
    .command("login")
    .description("Connect eBay locally and store the OAuth session in this CLI profile")
    .option("--environment <environment>", "production or sandbox", "production")
    .option("--marketplace <marketplaceId>", "default marketplace for the authorization request", "EBAY_US")
    .option("--no-open", "print the authorization URL instead of opening a browser")
    .option("--timeout-seconds <seconds>", "how long to wait for the callback", "180")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const authResult = await authenticateWithEbayLocally(profile, {
        environment: options.environment,
        marketplaceId: options.marketplace,
        shouldOpen: options.open,
        timeoutMs: Number(options.timeoutSeconds) * 1000
      });
      upsertProfile({ name: global.profile, ebaySession: authResult.session });
      renderResult(
        { authorize: authResult.authorize, opened: authResult.opened, connection: redactSessionForOutput(authResult.session) },
        Boolean(global.json)
      );
    });

  auth
    .command("status")
    .description("Show the current locally-connected eBay account")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      renderConnectionStatus(await getLocalConnectionStatus(profile), Boolean(global.json));
    });

  auth
    .command("logout")
    .description("Clear only the local eBay session for this CLI profile")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      clearLocalEbaySession(global.profile);
      renderResult({ disconnected: true, mode: "local-only" }, Boolean(global.json));
    });

  auth
    .command("disconnect")
    .description("Clear the local session and show how to revoke the grant in My eBay")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      clearLocalEbaySession(global.profile);
      renderResult(
        {
          disconnected: true,
          mode: "local-plus-manual-ebay-revoke-guidance",
          localSessionCleared: true,
          manualRevocationRequired: true,
          revokePath: [
            "My eBay",
            "Account",
            "Sign in and security",
            "Third-party app access",
            "View"
          ],
          note: "This CLI does not currently call eBay's token-revocation endpoint. To fully revoke the grant, remove the app in My eBay after clearing the local session."
        },
        Boolean(global.json)
      );
    });

  const setup = program.command("setup").description("Seller readiness and local defaults");
  setup
    .command("doctor")
    .description("Check whether the connected eBay account is ready to list")
    .action(async (_, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      renderDoctorReport(await runLocalDoctor(profile), Boolean(global.json));
    });

  const policies = setup.command("policies").description("Inspect and sync business policy defaults");
  policies
    .command("opt-in")
    .option("--program-type <programType>", "seller program to opt into", "SELLING_POLICY_MANAGEMENT")
    .description("Opt the connected eBay account into a seller program such as business policies")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      renderResult(await optInLocalPolicyProgram(profile, options.programType), Boolean(global.json));
    });

  policies
    .command("sync")
    .option("--payment-policy-id <id>")
    .option("--return-policy-id <id>")
    .option("--fulfillment-policy-id <id>")
    .option("--create-from <file>", "optional JSON/YAML payload for policy creation")
    .description("Sync business policy defaults and persist local defaults")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const result = await syncLocalPolicies(profile, {
        paymentPolicyId: options.paymentPolicyId,
        returnPolicyId: options.returnPolicyId,
        fulfillmentPolicyId: options.fulfillmentPolicyId,
        createFromFile: options.createFrom
      });
      renderResult(result.result, Boolean(global.json));
    });

  const location = setup.command("location").description("Manage the default fulfillment location");
  location
    .command("set")
    .option("--key <merchantLocationKey>")
    .option("--file <path>", "JSON/YAML location payload file")
    .description("Create or update the default location")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const result = await createOrSetLocalLocation(profile, { key: options.key, file: options.file });
      renderResult(result.result, Boolean(global.json));
    });

  const listings = program.command("listings").description("List, plan, create, update, and end listings");
  listings
    .command("list")
    .option("--status <status>", "filter by listing status")
    .option("--page <number>", "page number for paginated listing reads", "1")
    .option("--limit <number>", "page size for paginated listing reads", "100")
    .option("--days <number>", "lookback window in days for SOLD listings", "30")
    .description("List listings for the connected eBay account")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      renderListings(
        await listLocalListings(profile, {
          status: options.status,
          page: Number(options.page),
          limit: Number(options.limit),
          days: Number(options.days)
        }),
        Boolean(global.json)
      );
    });

  listings
    .command("get")
    .argument("<reference>", "sku:..., offer:..., listing:..., or raw sku")
    .description("Resolve a listing and show the normalized spec")
    .action(async (reference, _options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      renderResult(await getLocalListing(profile, reference), Boolean(global.json));
    });

  listings
    .command("pull")
    .argument("<reference>", "sku:..., offer:..., listing:..., or raw sku")
    .requiredOption("--out <path>", "where to write the normalized spec")
    .description("Export a normalized listing spec")
    .action(async (reference, options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const spec = await pullLocalListing(profile, reference, options.out);
      renderResult({ out: options.out, spec }, Boolean(global.json));
    });

  listings
    .command("create")
    .requiredOption("--file <path>", "listing spec file")
    .option("--write-path <path>", "INVENTORY or TRADING")
    .option("--verify", "validate the create payload remotely without creating the listing", false)
    .option("--apply", "execute the create call instead of printing the plan", false)
    .description("Plan or create a listing")
    .action(async (options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const request = {
        ...(await parseListingSpecFile(options.file)),
        ...(options.writePath ? { writePath: normalizeWritePathOption(options.writePath) } : {})
      };
      if (options.verify && options.apply) {
        throw new AppError("VALIDATION_ERROR", "Use either --verify or --apply, not both.");
      }
      if (options.verify) {
        renderResult(await verifyLocalListingCreate(profile, request), Boolean(global.json));
        return;
      }
      if (!options.apply) {
        renderMutationPlan(await createLocalListingPlan(profile, request), Boolean(global.json));
        return;
      }
      renderResult(await createLocalListing(profile, request), Boolean(global.json));
    });

  listings
    .command("update")
    .argument("<reference>", "sku:..., offer:..., listing:..., or raw sku")
    .requiredOption("--file <path>", "listing patch file")
    .option("--apply", "execute the update instead of printing the plan", false)
    .description("Plan or apply a listing update")
    .action(async (reference, options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      const request = await parseListingPatchFile(options.file);
      if (!options.apply) {
        renderMutationPlan(await updateLocalListingPlan(profile, reference, request), Boolean(global.json));
        return;
      }
      renderResult(await updateLocalListing(profile, reference, request), Boolean(global.json));
    });

  listings
    .command("end")
    .argument("<reference>", "sku:..., offer:..., listing:..., or raw sku")
    .option("--apply", "execute the end call instead of printing the plan", false)
    .description("Plan or withdraw a listing")
    .action(async (reference, options, command: Command) => {
      const global = getGlobalOptions(command);
      const profile = requireConfiguredProfile(global.profile);
      if (!options.apply) {
        renderMutationPlan(await endLocalListingPlan(profile, reference), Boolean(global.json));
        return;
      }
      renderResult(await endLocalListing(profile, reference), Boolean(global.json));
    });

  return program;
}

export function buildConfigStatusForOutput(profile: ReturnType<typeof resolveProfile>) {
  const configured = {
    backendBaseUrl: Boolean(profile.backendBaseUrl),
    ebaySession: Boolean(profile.ebaySession)
  };
  const guidance = !profile.backendBaseUrl
    ? buildBootstrapGuidance(profile, "missing_backend_url")
    : !profile.ebaySession
      ? buildBootstrapGuidance(profile, "missing_ebay_session")
      : undefined;

  return {
    profile: redactProfileForOutput(profile),
    setup: {
      authMode: profile.backendBaseUrl ? "backend-relay" : "unconfigured",
      configured,
      readyForLogin: configured.backendBaseUrl,
      readyForOperations: configured.backendBaseUrl && configured.ebaySession,
      ...(guidance ? { nextCommands: guidance.nextCommands, notes: guidance.notes, docs: guidance.docs } : {})
    }
  };
}

function normalizeWritePathOption(value: string): WritePath {
  const normalized = value.trim().toUpperCase();
  if (normalized === "INVENTORY" || normalized === "TRADING") {
    return normalized;
  }

  throw new AppError("VALIDATION_ERROR", "--write-path must be INVENTORY or TRADING.");
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createCli();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof AppError) {
      if (shouldRenderErrorAsJson(argv)) {
        process.stderr.write(`${JSON.stringify({ error: serializeAppError(error) }, null, 2)}\n`);
      } else {
        process.stderr.write(`${error.code}: ${error.message}\n`);
        if (error.details !== undefined) {
          process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
        }
      }
      process.exitCode = error.exitCode;
      return;
    }

    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write("Unknown error.\n");
    }
    process.exitCode = 1;
  }
}

function shouldRenderErrorAsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

function serializeAppError(error: AppError): { code: string; message: string; details?: unknown } {
  return {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {})
  };
}
