# ebaycli

`ebaycli` is a local eBay seller CLI for reading listings, preparing changes, and publishing through eBay's Trading and Inventory APIs. It supports human use and automation through `--json`, `ebay guide`, and `ebay llms`.

The CLI stores your seller session locally and performs listing and seller setup workflows directly against eBay. Login and token refresh use a deployment-owned OAuth relay, which owns the eBay app credentials and public HTTPS callback. The [TypeScript Cloudflare Worker in this repository](https://github.com/developmentjgonz/ebaycli/blob/main/backend/README.md) is an optional reference implementation of that required relay capability. The CLI does not accept eBay app credentials directly or provide a shared public login service.

## Install and connect

You need Node.js **22 or newer**, npm, an eBay account, and a working relay URL configured for the environment you will use. Seller accounts must meet eBay's category, policy, and location requirements before listing writes succeed. Relay operators can follow the [deployment guide](https://github.com/developmentjgonz/ebaycli/blob/main/docs/deployment.md).

The package is not yet published to npm. Install from this repository:

```bash
git clone https://github.com/developmentjgonz/ebaycli.git
cd ebaycli/cli
npm ci
npm run build
npm install -g .
```

Then connect the default profile to production:

```bash
ebay guide --json
ebay config set --backend-url https://your-relay.example.com --json
ebay auth login --environment production --json
ebay status --json
ebay listings list --limit 5 --json
```

Replace the example URL with your own relay. Login opens eBay consent in your browser and waits for the callback on local port `8765`. Run it on the machine receiving that local callback. `--timeout-seconds 300` extends the default three-minute wait.

Choose a trusted HTTPS relay: its operator handles your seller tokens during login and refresh. HTTP is supported only on `localhost` or `127.0.0.1` for development. Auth requests do not follow redirects, so use the final endpoint URL. Operators serving other sellers should review the [hosting model](https://github.com/developmentjgonz/ebaycli/blob/main/docs/hosting-model.md) first.

Use `--no-open` to open the consent link yourself. The CLI prints the link to stderr before waiting, including when automatic browser launch fails; JSON results stay on stdout. Complete consent in a browser on the same machine as the CLI.

Use a separate sandbox profile and a relay configured with sandbox credentials when testing:

```bash
ebay --profile sandbox config set --backend-url https://your-relay.example.com --json
ebay --profile sandbox auth login --environment sandbox --json
ebay --profile sandbox status --json
```

If you prefer not to install globally, use `node dist/index.js` in place of `ebay` while working from `cli/`. See [CONTRIBUTING.md](https://github.com/developmentjgonz/ebaycli/blob/main/CONTRIBUTING.md) for contributor setup. After a public npm release is available, the installation command will be `npm install -g ebaycli`.

## Find the right command

```bash
ebay --help
ebay listings create --help
ebay guide capabilities --json
ebay guide workflows --json
ebay guide listing-spec --json
ebay guide agent-notes --json
ebay llms
```

The runtime guide is version-matched to the installed package. Use `guide listing-spec` before drafting and `status --json` before running operations. `status` combines profile configuration, auth status, and seller readiness. [SUPPORT_MATRIX.md](SUPPORT_MATRIX.md) describes supported operations and limits.

## Read and export listings

```bash
ebay listings list --limit 5 --json
ebay listings list --status SOLD --days 30 --json
ebay listings get listing:YOUR_LISTING_ID --json
ebay listings pull listing:YOUR_LISTING_ID --out ./existing.yaml --json
```

References can use `sku:YOUR_SKU`, `offer:YOUR_OFFER_ID`, or `listing:YOUR_LISTING_ID`. Numeric references are listing IDs. Reads support classic Trading and Inventory listings; legacy detail may use Browse fallback. Exported YAML is a baseline for review. Check category, condition, photos, and model-specific fields before using an export to create another listing.

## Prepare and publish a listing

Copy and edit [examples/listing.yaml](examples/listing.yaml) for Inventory or [examples/listing-trading.yaml](examples/listing-trading.yaml) for Trading. The [examples index](examples/README.md) explains each payload. These files ship in the npm package's `examples/` directory; `npm root -g` shows the parent directory of globally installed packages.

YAML and JSON are supported. A minimal Inventory draft has this shape:

```yaml
sku: SAMPLE-SKU-001
writePath: INVENTORY
marketplaceId: EBAY_US
title: Vintage brass desk lamp
description: Tested lamp with minor cosmetic wear. Describe the actual item.
categoryId: "262197"
condition: USED_EXCELLENT
price:
  value: "89.99"
  currency: USD
availableQuantity: 1
images:
  - ./photos/lamp-front.jpg
aspects:
  Brand: [Unbranded]
  Type: [Desk Lamp]
```

Replace category, condition, item details, and photo paths for your item. Relative image paths are resolved from the draft file's directory. Images can also be HTTP(S) URLs or objects with `url`, `path`, or `base64Content`. Inventory publishing needs business policy IDs and a merchant location, either in the draft or saved as profile defaults.

Preview the intended actions:

```bash
ebay listings create --file ./listing.yaml --json
```

`writePath` defaults to `INVENTORY`. Set `writePath: TRADING` in a Trading draft or use `--write-path TRADING` to override it. For Trading, validate the payload with eBay before publishing:

```bash
ebay listings create --file ./listing-trading.yaml --verify --json
```

Trading verification may upload local images and calls eBay's validation endpoint, but does not create a listing. Inventory remote verification is not implemented: `--verify` returns `verified: false` with a plan. A successful plan or verification does not guarantee that eBay will accept publication.

After reviewing the listing and plan, publish with:

```bash
ebay listings create --file ./listing.yaml --apply --json
```

Create, update, and end print plans unless `--apply` is supplied. Do not combine `--verify` with `--apply`.

## Update or end a listing

Export the existing listing first, then put only the fields to change in a patch. [examples/price-update.yaml](examples/price-update.yaml) demonstrates a price and quantity patch:

```bash
ebay listings pull listing:YOUR_LISTING_ID --out ./existing.yaml --json
ebay listings update listing:YOUR_LISTING_ID --file ./price-update.yaml --json
ebay listings update listing:YOUR_LISTING_ID --file ./price-update.yaml --apply --json
```

To end a listing:

```bash
ebay listings end listing:YOUR_LISTING_ID --json
ebay listings end listing:YOUR_LISTING_ID --apply --json
```

Update and end choose Trading or Inventory based on the resolved listing. Plans can read eBay data; review the chosen actions before applying them.

## Set up policies and a location

Check readiness and inspect existing business policies:

```bash
ebay setup doctor --json
ebay setup policies sync --json
```

When multiple policies exist, select the default IDs explicitly:

```bash
ebay setup policies sync --payment-policy-id YOUR_PAYMENT_POLICY_ID --fulfillment-policy-id YOUR_FULFILLMENT_POLICY_ID --return-policy-id YOUR_RETURN_POLICY_ID --json
```

To create policies or a merchant location, customize [examples/policies.yaml](examples/policies.yaml) and [examples/location.yaml](examples/location.yaml):

```bash
ebay setup policies opt-in --json
ebay setup policies sync --create-from ./policies.yaml --json
ebay setup location set --file ./location.yaml --json
```

These setup commands act immediately and do not use `--apply`. `policies.yaml` contains `paymentPolicy`, `fulfillmentPolicy`, and `returnPolicy` objects. `location.yaml` contains `merchantLocationKey`, a name, and an address. eBay may reject opt-in or policy creation for unsupported accounts. If you already have a location, `setup location set --key YOUR_LOCATION_KEY` saves it as the local default without creating it.

## Profiles and disconnecting

The default profile is `default`. `--profile NAME` selects an independent relay URL, seller session, and policy/location defaults. Keep sandbox and production in separate profiles and use the same profile across connection, setup, and listing commands.

The production quick start and listing examples use `default`. For sandbox operations, add `--profile sandbox` to every example command.

See the [profile guide](https://github.com/developmentjgonz/ebaycli/blob/main/docs/profiles.md) for storage and bootstrap behavior.

```bash
ebay --profile sandbox config status --json
ebay --profile sandbox auth status --json
```

Profiles live in `~/.config/ebaycli/backend-profiles.json`, or `$XDG_CONFIG_HOME/ebaycli/backend-profiles.json` when that variable is set. The file contains OAuth tokens. Login stores the session there, and operations refresh expiring access tokens through the relay.

```bash
ebay --profile sandbox auth logout --json
ebay auth disconnect --json
```

`logout` clears the local session. `disconnect` also returns the My eBay path for manually removing the third-party app grant. Clearing a local session alone does not revoke that grant. Run these commands when finished using the connection, not during initial setup.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| No relay URL is configured | Run `config set --backend-url YOUR_RELAY_URL` for the same profile. |
| No seller session is connected | Run `auth login` for the intended profile and environment. |
| Consent fails or login times out | Check the relay's registered HTTPS callback and complete consent on the CLI's computer. If the callback link expired or was already used, check whether login completed; otherwise stop the old command and start a fresh login with its new consent URL. See the [deployment guide](https://github.com/developmentjgonz/ebaycli/blob/main/docs/deployment.md). |
| Reads work but create fails | Run `setup doctor --json`; check seller registration, policy IDs, location, and category requirements. Sandbox accounts may connect without being seller-ready. |
| A local image cannot be read | Resolve its path relative to the draft file and confirm the image exists. |
| Trading verification returns `verified: false` | Inspect the returned error or reason; confirm `writePath: TRADING` and a condition accepted by the category. |
| A grant expires or is revoked | Reconnect with `auth login` using the same profile and intended environment. |

See [TESTING.md](https://github.com/developmentjgonz/ebaycli/blob/main/TESTING.md) for test scope and live-account checks, the [code map](https://github.com/developmentjgonz/ebaycli/blob/main/docs/code-map.md) for source navigation, and [architecture](https://github.com/developmentjgonz/ebaycli/blob/main/docs/agent-first-architecture.md) for product boundaries. Report reproducible issues at [GitHub Issues](https://github.com/developmentjgonz/ebaycli/issues).

## Development and release

From `cli/`:

```bash
npm run check
npm pack --dry-run
```

`check` runs type checking, tests, and the build. The package includes compiled runtime files, these docs, [llms.txt](llms.txt), examples, the support matrix, and the MIT [license](LICENSE). `prepublishOnly` runs tests and builds before publication. See [CONTRIBUTING.md](https://github.com/developmentjgonz/ebaycli/blob/main/CONTRIBUTING.md) for release practices.
