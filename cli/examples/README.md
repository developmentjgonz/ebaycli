# Payload examples

These templates ship with the npm package. Copy them into your working directory, replace sample item/account values, and add your own photos. No image files are bundled. Run `ebay guide listing-spec --json` for the version-matched listing schema.

| File | Purpose | Command after customization |
| --- | --- | --- |
| [listing.yaml](listing.yaml) | Inventory listing draft | `ebay listings create --file ./listing.yaml --json` |
| [listing-trading.yaml](listing-trading.yaml) | Trading fixed-price listing draft | `ebay listings create --file ./listing-trading.yaml --verify --json` |
| [price-update.yaml](price-update.yaml) | Price/quantity patch | `ebay listings update listing:YOUR_LISTING_ID --file ./price-update.yaml --json` |
| [policies.yaml](policies.yaml) | Business policy creation payload | `ebay setup policies sync --create-from ./policies.yaml --json` |
| [location.yaml](location.yaml) | Merchant location creation/update payload | `ebay setup location set --file ./location.yaml --json` |

The listing examples use the same sample lamp to show the two API models. Category and condition requirements depend on your actual item. Inventory conditions are named values; Trading condition IDs are numeric strings. Both drafts use placeholder policy IDs. Supply your own IDs or remove the `policies` block to use saved profile defaults. Inventory also uses `locationKey`; Trading uses shipping origin fields.

`price.value`/`price.currency` are convenient YAML aliases for the normalized `priceValue`/`priceCurrency` fields. Relative image paths resolve from the draft's directory. Update patches should contain only the fields you intend to change.

Create/update/end commands plan by default; review the plan before adding `--apply`. Trading `--verify` can upload images while validating a payload without publishing. Setup policy/location commands act immediately and do not have a plan mode.

Policy examples define sample terms, not recommendations for your business. Confirm the shipping service and costs against [eBay's marketplace shipping metadata](https://developer.ebay.com/api-docs/sell/static/seller-accounts/ht_shipping-setting-shipping-carrier-and-service-values.html). The return example uses a 30-day money-back policy with `returnShippingCostPayer`; refund money back is the default, and `returnMethod` is reserved for replacement items. See the [Account API return-policy schema](https://developer.ebay.com/api-docs/sell/account/resources/return_policy/methods/createReturnPolicy).

See the [package README](../README.md) for connection, profile, and publish workflows, and the [testing guide](https://github.com/developmentjgonz/ebaycli/blob/main/TESTING.md) for live-account checks.
