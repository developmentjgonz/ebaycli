type GuideTopic =
  | "overview"
  | "capabilities"
  | "workflows"
  | "listing-spec"
  | "agent-notes";

const LISTING_SPEC_EXAMPLE = {
  sku: "GENGAR-38-PLUSH-001",
  writePath: "INVENTORY",
  title: "Pokemon Gengar Plush 38 Inch Purple Character Pillow New",
  description:
    "Large 38 inch Gengar plush pillow in new condition. Confirm exact measurements, tag details, and brand before publishing.",
  categoryId: "2624",
  condition: "NEW",
  priceValue: 89.99,
  priceCurrency: "USD",
  availableQuantity: 1,
  images: [
    {
      path: "./photos/gengar-front.jpg"
    }
  ],
  aspects: {
    Character: ["Gengar"],
    Franchise: ["Pokemon"],
    Color: ["Purple"],
    Type: ["Plush Toy"]
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
    model: "self-managed-local-cli",
    summary:
      "The CLI stores the eBay session locally, keeps listing/setup logic local, and uses only self-managed eBay app credentials. The optional .NET backend in the repo is a reference implementation for privacy/auth landing pages, token exchange hosting, and eBay-required server-side surfaces.",
    authModel: {
      mode: "self-managed",
      setup: [
        "Run `ebay config auth --client-id ... --client-secret ... --runame ... --environment production`.",
        "Run `ebay auth login --environment production` and complete the eBay consent flow.",
        "Optional URLs default to the configured companion backend/site: `/privacy`, `/auth/success`, `/auth/declined`."
      ]
    },
    topics: ["capabilities", "workflows", "listing-spec", "agent-notes"],
    coreCommands: [
      "ebay config auth --client-id ... --client-secret ... --runame ...",
      "ebay auth login --environment production",
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
        purpose: "Set the optional companion backend/site URL used to derive default privacy and auth landing page URLs."
      },
      {
        command: "ebay config auth --client-id ... --client-secret ... --runame ... --environment production",
        purpose: "Store the user-provided eBay app credentials in the local CLI profile."
      }
    ],
    auth: [
      {
        command: "ebay auth login",
        purpose: "Run eBay OAuth locally and store the refresh/access token in the selected CLI profile."
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
        purpose: "Read or set default business policy ids for Inventory-based listing flows."
      },
      {
        command: "ebay setup policies opt-in",
        purpose: "Attempt seller program opt-in for Business Policies."
      },
      {
        command: "ebay setup location set",
        purpose: "Create or update the default merchant location for Inventory-based listing flows."
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
        purpose: "Plan a new listing create. Use `writePath` or `--write-path` to target INVENTORY or TRADING explicitly."
      },
      {
        command: "ebay listings create --file <draft.yaml> --verify",
        purpose: "Validate a Trading create payload remotely without creating the listing."
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
        "Run `ebay config auth --client-id ... --client-secret ... --runame ... --environment production` first.",
        "Run `ebay auth login --environment production` and finish the eBay consent flow in the browser.",
        "Run `ebay status --json` to verify the local session and seller readiness in one call."
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
        "If Business Policies or location are missing, use `ebay setup policies sync` and `ebay setup location set` where the account supports them.",
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
        "Run `ebay listings create --file draft.yaml --verify` when validating a Trading/classic create before any destructive action.",
        "Only run `ebay listings create --file draft.yaml --apply` after reviewing images, policies, category, and condition."
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
      "Each image entry can be an object with `url`, `path`, or `base64Content`."
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
      "For Trading/classic creates, prefer `--verify` before ending or replacing a live listing."
    ]
  };
}
