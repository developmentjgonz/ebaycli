type GuideTopic =
  | "overview"
  | "capabilities"
  | "workflows"
  | "listing-spec"
  | "agent-notes";

const LISTING_SPEC_EXAMPLE = {
  sku: "SAMPLE-SKU-001",
  writePath: "INVENTORY",
  title: "Brass desk lamp",
  description:
    "Brass desk lamp with tested wiring and minor cosmetic wear. Confirm measurements and condition before publishing.",
  categoryId: "262197",
  condition: "USED_EXCELLENT",
  priceValue: 89.99,
  priceCurrency: "USD",
  availableQuantity: 1,
  images: [
    {
      path: "./photos/lamp-front.jpg"
    }
  ],
  aspects: {
    Brand: ["Unbranded"],
    Type: ["Desk Lamp"]
  }
};

export function getGuide(topic?: string): unknown {
  const normalized = normalizeTopic(topic);
  switch (normalized) {
    case "capabilities":
      return buildCapabilitiesGuide();
    case "workflows":
      return buildWorkflowGuide();
    case "listing-spec":
      return buildListingSpecGuide();
    case "agent-notes":
      return buildAgentNotesGuide();
    case "overview":
    default:
      return buildOverviewGuide();
  }
}

function normalizeTopic(topic?: string): GuideTopic {
  if (!topic) {
    return "overview";
  }

  switch (topic.toLowerCase()) {
    case "capabilities":
    case "workflows":
    case "listing-spec":
    case "agent-notes":
    case "overview":
      return topic.toLowerCase() as GuideTopic;
    default:
      return "overview";
  }
}

function buildOverviewGuide() {
  return {
    model: "backend-relay-local-cli",
    summary:
      "The CLI stores the eBay seller session locally and keeps listing/setup logic local. Sandbox and production OAuth use a deployment-owned relay with a public HTTPS callback.",
    authModel: {
      mode: "backend-relay",
      setup: [
        "Run `ebay config set --backend-url https://your-backend.example.com --json`.",
        "Run `ebay auth login --environment production --json` and complete the eBay consent flow.",
        "Do not configure eBay app credentials in the CLI; the backend owns OAuth credentials and callback handling.",
        "Use the same `--profile NAME` for connection and later operations; keep sandbox and production in separate profiles.",
        "Complete consent in a browser on the machine running the CLI so the redirect reaches its localhost listener. `auth login --no-open` prints the consent URL to stderr before waiting."
      ]
    },
    topics: ["capabilities", "workflows", "listing-spec", "agent-notes"],
    coreCommands: [
      "ebay config set --backend-url https://your-backend.example.com --json",
      "ebay auth login --environment production --json",
      "ebay status --json",
      "ebay auth status --json",
      "ebay setup doctor --json",
      "ebay listings list --json",
      "ebay listings get <reference> --json",
      "ebay listings create --file <draft.yaml>",
      "ebay listings update <reference> --file <patch.yaml>",
      "ebay listings end <reference>"
    ]
  };
}

function buildCapabilitiesGuide() {
  return {
    config: [
      {
        command: "ebay config set --backend-url <url>",
        purpose: "Set the deployment-owned relay URL used for sandbox/production OAuth callback and token exchange."
      },
    ],
    auth: [
      {
        command: "ebay auth login",
        purpose: "Run eBay OAuth through the configured backend relay and store the returned seller session in the selected CLI profile.",
        flags: ["--environment production|sandbox", "--no-open", "--timeout-seconds <seconds>"],
        notes: ["Browser consent must complete on the same machine as the CLI. `--no-open` prints the URL to stderr while the CLI waits for the localhost callback."]
      },
      {
        command: "ebay auth status",
        purpose: "Show the connected eBay account and seller registration state."
      },
      {
        command: "ebay auth logout",
        purpose: "Delete only the local eBay session from the selected CLI profile."
      },
      {
        command: "ebay auth disconnect",
        purpose:
          "Delete the local eBay session and return the My eBay path the user must follow to revoke the third-party grant."
      }
    ],
    operations: [
      {
        command: "ebay status",
        purpose: "Return one combined snapshot containing profile config, auth status, and doctor results for the selected profile."
      }
    ],
    setup: [
      {
        command: "ebay setup doctor",
        purpose: "Check seller readiness, business policies, and inventory-location status."
      },
      {
        command: "ebay setup policies sync",
        purpose: "Read or set default business policy ids for Inventory-based listing flows.",
        notes: ["`--create-from <file>` creates policies on eBay immediately. This setup command has no plan or `--apply` mode."]
      },
      {
        command: "ebay setup policies opt-in",
        purpose: "Attempt seller program opt-in for Business Policies immediately; no plan or `--apply` mode."
      },
      {
        command: "ebay setup location set",
        purpose: "With `--file`, create or update an eBay merchant location immediately. With `--key`, save an existing location as the local default. No plan or `--apply` mode."
      }
    ],
    listings: [
      {
        command: "ebay listings list",
        purpose: "List active or sold listings. Active and sold reads support classic Trading listings.",
        flags: ["--status ACTIVE|SOLD", "--page <n>", "--limit <n>", "--days <n>"]
      },
      {
        command: "ebay listings get <reference>",
        purpose: "Fetch normalized details for a sku, offer id, or listing id."
      },
      {
        command: "ebay listings pull <reference> --out <file>",
        purpose: "Export a normalized listing spec for review or later mutation."
      },
      {
        command: "ebay listings create --file <draft.yaml>",
        purpose: "Plan a new listing create. Defaults to INVENTORY; use `writePath` or `--write-path` to target INVENTORY or TRADING explicitly. Add `--apply` to execute the reviewed change."
      },
      {
        command: "ebay listings create --file <draft.yaml> --write-path TRADING --verify --json",
        purpose: "Validate a Trading create payload remotely without creating the listing; local images may be uploaded.",
        notes: ["Inventory remote verification is not implemented: `--verify` returns `verified: false` with a plan. Do not combine `--verify` with `--apply`."]
      },
      {
        command: "ebay listings update <reference> --file <patch.yaml>",
        purpose: "Plan an update. The CLI dispatches Trading or Inventory automatically based on listing type."
      },
      {
        command: "ebay listings end <reference>",
        purpose: "Plan an end/withdraw. The CLI dispatches Trading or Inventory automatically based on listing type."
      }
    ]
  };
}

function buildWorkflowGuide() {
  return {
    connect: {
      steps: [
        "Run `ebay config set --backend-url https://your-backend.example.com --json` first.",
        "Run `ebay auth login --environment production --json` and finish the eBay consent flow in the browser.",
        "Run `ebay status --json` to verify the local session and seller readiness in one call."
      ],
      notes: [
        "These commands select the default production profile. Add the same `--profile NAME` to every command when selecting another profile, and use `--environment sandbox` for sandbox login.",
        "Consent must complete in a browser on the CLI's machine. `auth login --no-open` prints the URL to stderr before waiting; a pasted callback-code workflow is not supported."
      ]
    },
    disconnect: {
      steps: [
        "Run `ebay auth logout` to clear only the local CLI session.",
        "Run `ebay auth disconnect` when you also want revocation guidance.",
        "If you want the app grant fully revoked, open My eBay > Account > Sign in and security > Third-party app access > View and remove the application there."
      ]
    },
    sellerReadiness: {
      steps: [
        "Run `ebay status --json` or `ebay setup doctor --json`.",
        "If Business Policies or location are missing, use `ebay setup policies sync` and `ebay setup location set` where the account supports them. Policy creation, program opt-in, and location creation/update act immediately; review their inputs first.",
        "If eBay rejects policy setup, reads can still work, but Inventory create/update may remain blocked."
      ]
    },
    readListings: {
      steps: [
        "Run `ebay listings list --json` for active listings.",
        "Run `ebay listings list --status SOLD --days 30 --json` for recent sold listings.",
        "Run `ebay listings get <listingId> --json` for normalized detail.",
        "Run `ebay listings pull <listingId> --out review.yaml` to export a reviewable spec."
      ]
    },
    draftAndPublish: {
      steps: [
        "Create a YAML draft matching the listing-spec guide.",
        "Run `ebay listings create --file draft.yaml` to inspect the mutation plan.",
        "For a Trading/classic draft, run `ebay listings create --file draft.yaml --write-path TRADING --verify --json` to validate with eBay without publishing; local images may be uploaded.",
        "Inventory remote verification is not implemented; an Inventory `--verify` result with `verified: false` is a plan, not validation success.",
        "Only run `ebay listings create --file draft.yaml --apply` after reviewing images, policies, category, and condition and authorizing the seller's change. Do not combine `--verify` and `--apply`."
      ]
    },
    reviseExisting: {
      steps: [
        "Export a baseline with `ebay listings pull <reference> --out existing.yaml`.",
        "Create a patch YAML containing only the fields to change.",
        "Run `ebay listings update <reference> --file patch.yaml` to inspect the plan.",
        "Run `--apply` only after confirming the CLI chose the expected Trading or Inventory path."
      ]
    }
  };
}

function buildListingSpecGuide() {
  return {
    format: "YAML or JSON",
    requiredFields: ["sku", "title", "description", "categoryId", "condition", "priceValue", "availableQuantity"],
    optionalFields: [
      "writePath",
      "marketplaceId",
      "conditionDescription",
      "conditionDescriptors",
      "format",
      "priceCurrency",
      "policies",
      "locationKey",
      "location",
      "postalCode",
      "country",
      "dispatchTimeMax",
      "bestOfferEnabled",
      "minimumBestOfferPrice",
      "autoAcceptPrice",
      "images",
      "aspects",
      "packageWeightAndSize",
      "locale"
    ],
    imageRules: [
      "Each image entry can be a URL string.",
      "Each image entry can be a local path string.",
      "Each image entry can be an object with `url`, `path`, or `base64Content`.",
      "Relative image paths resolve from the draft or patch file's directory. Trading `--verify` may upload local images."
    ],
    conditionNotes: [
      "Some categories require `conditionDescriptors` in addition to `condition`.",
      "Example for an ungraded trading card in category `261328`: `[{ name: \"40001\", values: [\"400010\"] }]`.",
      "If you are recreating an Inventory listing through Trading, review the target `condition` carefully. Inventory enums and Trading condition ids are not always the same shape."
    ],
    example: LISTING_SPEC_EXAMPLE
  };
}

function buildAgentNotesGuide() {
  return {
    principles: [
      "Prefer `--json` for every read, plan, and apply command.",
      "Use `ebay status --json` as the first operational check on a profile.",
      "Use `ebay guide listing-spec --json` before generating listing drafts.",
      "Use `ebay listings pull <reference> --out <file>` to ground updates on an existing listing.",
      "Prefer plan commands before apply commands.",
      "Apply only seller-authorized changes. OAuth grants API access; it does not review a draft or approve each later mutation.",
      "Use the same `--profile NAME` throughout a workflow, with separate sandbox and production profiles.",
      "Profiles select local sessions; they are not tenant isolation. Concurrent agents should use separate `XDG_CONFIG_HOME` directories or serialize profile saves because the profile file has no cross-process write lock.",
      "Treat numeric references as listing ids unless a sku or offer prefix is supplied.",
      "Do not assume `ebay auth logout` revokes the eBay grant. Use `ebay auth disconnect` and follow the My eBay revoke path when you want the grant removed."
    ],
    dispatchModel: {
      inventory:
        "Inventory-backed listings use Sell Inventory APIs and require business policies plus a merchant location.",
      trading:
        "Classic eBay listings read through Trading APIs. Update and end commands dispatch to Trading automatically when the listing resolves as a classic listing. New Trading/classic creates are supported when the draft explicitly uses `writePath: TRADING`."
    },
    safetyChecks: [
      "Run `ebay setup doctor --json` before attempting create/apply on a new account.",
      "Do not assume Business Policies are available just because OAuth works.",
      "Use plan output to confirm whether the CLI intends to use Trading or Inventory before apply.",
      "Policy creation, program opt-in, and location creation/update act immediately and have no listing `--apply` gate.",
      "For Trading/classic creates, use `--write-path TRADING --verify` before publishing; local images may be uploaded. Inventory remote verification is not implemented."
    ]
  };
}
