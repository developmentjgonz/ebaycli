import { XMLBuilder, XMLParser } from "fast-xml-parser";

import { AppError } from "./errors.js";

export interface EbayEnvironmentDescriptor {
  name: "production" | "sandbox";
  authBaseUrl: string;
  apiBaseUrl: string;
  identityBaseUrl: string;
  mediaBaseUrl: string;
  tradingBaseUrl: string;
}

const JsonHeaders = { Accept: "application/json" };
const TradingCompatibilityLevel = "1231";
const RetryableTradingCalls = new Set(["GetMyeBaySelling", "GetItem", "VerifyAddFixedPriceItem"]);
const MaxRetryDelayMs = 30_000;
const tradingParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true
});
const tradingBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
  suppressBooleanAttributes: false
});

const MarketplaceLocales: Record<string, string> = {
  EBAY_US: "en-US",
  EBAY_GB: "en-GB",
  EBAY_AU: "en-AU",
  EBAY_CA: "en-CA",
  EBAY_DE: "de-DE",
  EBAY_FR: "fr-FR",
  EBAY_IT: "it-IT",
  EBAY_ES: "es-ES"
};

const MarketplaceSiteIds: Record<string, string> = {
  EBAY_US: "0",
  EBAY_GB: "3",
  EBAY_AU: "15",
  EBAY_CA: "2",
  EBAY_DE: "77",
  EBAY_FR: "71",
  EBAY_IT: "101",
  EBAY_ES: "186"
};

export function resolveEbayEnvironment(environment: string): EbayEnvironmentDescriptor {
  const normalized = environment.trim().toLowerCase();
  if (normalized === "sandbox") {
    return {
      name: "sandbox",
      authBaseUrl: "https://auth.sandbox.ebay.com/oauth2",
      apiBaseUrl: "https://api.sandbox.ebay.com",
      identityBaseUrl: "https://apiz.sandbox.ebay.com",
      mediaBaseUrl: "https://apim.sandbox.ebay.com",
      tradingBaseUrl: "https://api.sandbox.ebay.com/ws/api.dll"
    };
  }

  return {
    name: "production",
    authBaseUrl: "https://auth.ebay.com/oauth2",
    apiBaseUrl: "https://api.ebay.com",
    identityBaseUrl: "https://apiz.ebay.com",
    mediaBaseUrl: "https://apim.ebay.com",
    tradingBaseUrl: "https://api.ebay.com/ws/api.dll"
  };
}

export class EbayApiClient {
  public constructor(private readonly environment: EbayEnvironmentDescriptor) {}

  public async getUser(accessToken: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return await this.requestJson(`${this.environment.identityBaseUrl}/commerce/identity/v1/user/`, {
      method: "GET",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async getPrivileges(accessToken: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/account/v1/privilege`, {
      method: "GET",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async getPaymentPolicies(accessToken: string, marketplaceId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`, {
      method: "GET",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async getFulfillmentPolicies(accessToken: string, marketplaceId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`, {
      method: "GET",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async getReturnPolicies(accessToken: string, marketplaceId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`, {
      method: "GET",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async createPaymentPolicy(accessToken: string, payload: unknown, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/account/v1/payment_policy`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async createFulfillmentPolicy(accessToken: string, payload: unknown, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/account/v1/fulfillment_policy`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async createReturnPolicy(accessToken: string, payload: unknown, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/account/v1/return_policy`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async optInToProgram(accessToken: string, programType: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/account/v1/program/opt_in`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify({ programType })
    }, signal);
  }

  public async getLocations(accessToken: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/location`, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async createInventoryLocation(accessToken: string, merchantLocationKey: string, payload: unknown, locale?: string, marketplaceId?: string, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`, {
      method: "POST",
      headers: inventoryHeaders(accessToken, locale, marketplaceId),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async updateInventoryLocation(accessToken: string, merchantLocationKey: string, payload: unknown, locale?: string, marketplaceId?: string, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`, {
      method: "PUT",
      headers: inventoryHeaders(accessToken, locale, marketplaceId),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async getInventoryItem(accessToken: string, sku: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async getInventoryItems(accessToken: string, limit: number, offset: number, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async upsertInventoryItem(accessToken: string, sku: string, payload: unknown, locale?: string, marketplaceId?: string, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: "PUT",
      headers: inventoryHeaders(accessToken, locale, marketplaceId),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async getOffers(accessToken: string, sku?: string, signal?: AbortSignal) {
    const url = sku
      ? `${this.environment.apiBaseUrl}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`
      : `${this.environment.apiBaseUrl}/sell/inventory/v1/offer`;
    return await this.requestJson(url, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async getOffer(accessToken: string, offerId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async createOffer(accessToken: string, payload: unknown, locale?: string, marketplaceId?: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/offer`, {
      method: "POST",
      headers: inventoryHeaders(accessToken, locale, marketplaceId),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async updateOffer(accessToken: string, offerId: string, payload: unknown, locale?: string, marketplaceId?: string, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
      method: "PUT",
      headers: inventoryHeaders(accessToken, locale, marketplaceId),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async publishOffer(accessToken: string, offerId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {
      method: "POST",
      headers: authorizedHeaders(accessToken)
    }, signal);
  }

  public async withdrawOffer(accessToken: string, offerId: string, signal?: AbortSignal) {
    await this.requestNoContentOrJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`, {
      method: "POST",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async bulkUpdatePriceQuantity(accessToken: string, payload: unknown, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/bulk_update_price_quantity`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify(payload)
    }, signal);
  }

  public async getListing(accessToken: string, listingId: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.apiBaseUrl}/sell/inventory/v1/listing/${encodeURIComponent(listingId)}`, {
      method: "GET",
      headers: inventoryHeaders(accessToken)
    }, signal);
  }

  public async createImageFromUrl(accessToken: string, imageUrl: string, signal?: AbortSignal) {
    return await this.requestJson(`${this.environment.mediaBaseUrl}/commerce/media/v1_beta/image/create_image_from_url`, {
      method: "POST",
      headers: authorizedJsonHeaders(accessToken),
      body: JSON.stringify({ imageUrl })
    }, signal);
  }

  public async createImageFromFile(accessToken: string, content: Uint8Array, fileName: string, contentType: string, signal?: AbortSignal) {
    const form = new FormData();
    const arrayBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
    form.set("image", new Blob([arrayBuffer], { type: contentType }), fileName);
    return await this.requestJson(`${this.environment.mediaBaseUrl}/commerce/media/v1_beta/image/create_image_from_file`, {
      method: "POST",
      headers: authorizedHeaders(accessToken),
      body: form
    }, signal);
  }

  public async getActiveListings(accessToken: string, marketplaceId: string, pageNumber: number, entriesPerPage: number, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "GetMyeBaySelling",
      {
        GetMyeBaySellingRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          ActiveList: {
            Include: true,
            Pagination: {
              EntriesPerPage: entriesPerPage,
              PageNumber: pageNumber
            }
          }
        }
      },
      signal
    );
    return parseTradingList(xml, marketplaceId, "ActiveList");
  }

  public async getSoldListings(accessToken: string, marketplaceId: string, durationInDays: number, pageNumber: number, entriesPerPage: number, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "GetMyeBaySelling",
      {
        GetMyeBaySellingRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          SoldList: {
            Include: true,
            DurationInDays: durationInDays,
            Pagination: {
              EntriesPerPage: entriesPerPage,
              PageNumber: pageNumber
            }
          }
        }
      },
      signal
    );
    return parseTradingList(xml, marketplaceId, "SoldList");
  }

  public async getLegacyListing(accessToken: string, marketplaceId: string, listingId: string, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "GetItem",
      {
        GetItemRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          ItemID: listingId,
          IncludeItemSpecifics: true,
          DetailLevel: "ReturnAll"
        }
      },
      signal
    );
    return parseLegacyListing(xml, marketplaceId);
  }

  public async verifyAddFixedPriceItem(accessToken: string, marketplaceId: string, payload: unknown, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "VerifyAddFixedPriceItem",
      {
        VerifyAddFixedPriceItemRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          ...(payload as Record<string, unknown>)
        }
      },
      signal
    );
    return parseTradingResponseSummary(xml, "VerifyAddFixedPriceItem");
  }

  public async addFixedPriceItem(accessToken: string, marketplaceId: string, payload: unknown, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "AddFixedPriceItem",
      {
        AddFixedPriceItemRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          ...(payload as Record<string, unknown>)
        }
      },
      signal
    );
    return parseTradingResponseSummary(xml, "AddFixedPriceItem");
  }

  public async reviseInventoryStatus(accessToken: string, marketplaceId: string, listingId: string, sku: string | undefined, priceValue: number | undefined, priceCurrency: string, quantity: number | undefined, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "ReviseInventoryStatus",
      {
        ReviseInventoryStatusRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          InventoryStatus: {
            ItemID: listingId,
            ...(sku ? { SKU: sku } : {}),
            ...(priceValue !== undefined ? { StartPrice: { "#text": String(priceValue), "@_currencyID": priceCurrency } } : {}),
            ...(quantity !== undefined ? { Quantity: quantity } : {})
          }
        }
      },
      signal
    );
    return parseTradingResponseSummary(xml, "ReviseInventoryStatus");
  }

  public async reviseFixedPriceItem(accessToken: string, marketplaceId: string, payload: unknown, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "ReviseFixedPriceItem",
      {
        ReviseFixedPriceItemRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          ...(payload as Record<string, unknown>)
        }
      },
      signal
    );
    return parseTradingResponseSummary(xml, "ReviseFixedPriceItem");
  }

  public async endFixedPriceItem(accessToken: string, marketplaceId: string, listingId: string, endingReason: string, signal?: AbortSignal) {
    const xml = await this.sendTradingCall(
      accessToken,
      marketplaceId,
      "EndFixedPriceItem",
      {
        EndFixedPriceItemRequest: {
          "@_xmlns": "urn:ebay:apis:eBLBaseComponents",
          EndingReason: endingReason,
          ItemID: listingId
        }
      },
      signal
    );
    return parseTradingResponseSummary(xml, "EndFixedPriceItem");
  }

  private async requestJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await this.sendWithRetry(url, { ...init, signal });
    const text = await response.text();
    if (!text) {
      return {};
    }
    return (JSON.parse(text) as Record<string, unknown>);
  }

  private async requestNoContentOrJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<void> {
    const response = await this.sendWithRetry(url, { ...init, signal });
    await response.text();
  }

  private async sendTradingCall(accessToken: string, marketplaceId: string, callName: string, payload: unknown, signal?: AbortSignal): Promise<string> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>${tradingBuilder.build(payload)}`;
    const response = await this.sendWithRetry(this.environment.tradingBaseUrl, {
      method: "POST",
      headers: {
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "X-EBAY-API-CALL-NAME": callName,
        "X-EBAY-API-COMPATIBILITY-LEVEL": TradingCompatibilityLevel,
        "X-EBAY-API-SITEID": MarketplaceSiteIds[marketplaceId] ?? "0",
        "Content-Type": "text/xml",
        Accept: "text/xml"
      },
      body: xml,
      signal
    });
    return await response.text();
  }

  private async sendWithRetry(url: string, init: RequestInit): Promise<Response> {
    const maxAttempts = 3;
    const baseDelayMs = 250;
    const retrySafe = isRetrySafeRequest(init);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let delayMs = baseDelayMs * attempt;
      try {
        const response = await fetch(url, init);
        if (response.ok) {
          return response;
        }

        const payload = await response.text();
        const requestedDelay = retryDelay(response.headers.get("Retry-After"), delayMs);
        if (attempt >= maxAttempts || !retrySafe || !shouldRetryStatus(response.status) || requestedDelay > MaxRetryDelayMs) {
          if (isRevokedAuthResponse(response.status, payload)) {
            throw new AppError(
              "AUTH_REVOKED",
              "The stored eBay authorization is no longer valid.",
              {
                status: response.status,
                response: payload
              }
            );
          }
          const guidance = !retrySafe && shouldRetryStatus(response.status)
            ? " The write was not retried. Inspect the seller account or listing state before repeating it."
            : requestedDelay > MaxRetryDelayMs && shouldRetryStatus(response.status)
              ? " eBay requested a longer wait; retry after the Retry-After interval."
              : "";
          throw new AppError("EBAY_API_ERROR", `eBay API request failed (${response.status}): ${payload}${guidance}`, payload);
        }
        delayMs = requestedDelay;
      } catch (error) {
        lastError = error;
        if (error instanceof AppError || init.signal?.aborted) {
          throw error;
        }
        if (!retrySafe) {
          throw new AppError(
            "EBAY_API_ERROR",
            "The eBay write could not be confirmed and was not retried because it may have succeeded. Inspect the seller account or listing state before repeating it."
          );
        }
        if (attempt >= maxAttempts) throw error;
      }

      await sleep(delayMs);
    }

    throw lastError instanceof Error
      ? lastError
      : new AppError("EBAY_API_ERROR", "eBay API request failed after retries.");
  }
}

function authorizedHeaders(accessToken: string): HeadersInit {
  return {
    ...JsonHeaders,
    Authorization: `Bearer ${accessToken}`
  };
}

function authorizedJsonHeaders(accessToken: string): HeadersInit {
  return {
    ...authorizedHeaders(accessToken),
    "Content-Type": "application/json"
  };
}

function inventoryHeaders(accessToken: string, locale?: string, marketplaceId?: string): HeadersInit {
  const contentLanguage = locale ?? (marketplaceId ? MarketplaceLocales[marketplaceId] : undefined) ?? "en-US";
  return {
    ...authorizedJsonHeaders(accessToken),
    "Accept-Language": contentLanguage,
    "Content-Language": contentLanguage
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetrySafeRequest(init: RequestInit): boolean {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  // Trading uses POST for reads too. Only known read/verification operations can be repeated safely.
  const callName = new Headers(init.headers).get("X-EBAY-API-CALL-NAME");
  return method === "POST" && callName !== null && RetryableTradingCalls.has(callName);
}

function retryDelay(value: string | null, fallbackMs: number): number {
  if (value === null) return fallbackMs;
  const seconds = Number(value);
  if (value.trim() && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallbackMs;
}

function isRevokedAuthResponse(status: number, payload: string): boolean {
  if (status === 401) {
    return true;
  }

  const normalized = payload.toLowerCase();
  return status === 403 && (
    normalized.includes("invalid_token") ||
    normalized.includes("invalid access token") ||
    normalized.includes("token expired") ||
    normalized.includes("revoked") ||
    normalized.includes("16110")
  );
}

function ensureTradingSuccess(root: Record<string, unknown>, callName: string) {
  const ack = readString(root, "Ack");
  if (ack !== "Success" && ack !== "Warning") {
    const errors = arrayify(root.Errors);
    const first = asRecord(errors[0]);
    const longMessage = first ? readString(first, "LongMessage") ?? readString(first, "ShortMessage") : undefined;
    throw new AppError("EBAY_API_ERROR", `eBay Trading API ${callName} failed: ${longMessage ?? "Unknown error"}`, root);
  }
}

function parseTradingList(xml: string, marketplaceId: string, listName: string): Record<string, unknown>[] {
  const parsed = tradingParser.parse(xml) as Record<string, unknown>;
  const root = firstObjectValue(parsed);
  ensureTradingSuccess(root, "GetMyeBaySelling");
  const list = asRecord(root[listName]);
  const items = arrayify(asRecord(list?.ItemArray)?.Item);
  return items.map((rawItem) => {
    const item = asRecord(rawItem) ?? {};
    const sellingStatus = asRecord(item.SellingStatus);
    const txArray = asRecord(sellingStatus?.TransactionArray);
    const transaction = asRecord(txArray?.Transaction);
    const orderTransactionArray = asRecord(list?.OrderTransactionArray);
    const orderTransaction = asRecord(orderTransactionArray?.OrderTransaction);
    const orderTransactionTx = asRecord(orderTransaction?.Transaction);
    const effectiveTransaction = transaction ?? orderTransactionTx;
    const buyer = asRecord(effectiveTransaction?.Buyer);
    const listingDetails = asRecord(item.ListingDetails);
    return {
      sku: readString(item, "SKU") ?? readString(item, "ItemID") ?? "",
      marketplaceId,
      offerId: null,
      listingId: readString(item, "ItemID"),
      status: readString(sellingStatus, "ListingStatus") ?? (listName === "SoldList" ? "SOLD" : "ACTIVE"),
      title: readString(item, "Title"),
      priceValue: parseNumber(readAmountValue(effectiveTransaction?.TransactionPrice) ?? readAmountValue(sellingStatus?.CurrentPrice)),
      priceCurrency: readAmountCurrency(effectiveTransaction?.TransactionPrice) ?? readAmountCurrency(sellingStatus?.CurrentPrice),
      availableQuantity: parseInteger(readString(item, "QuantityAvailable") ?? readString(item, "Quantity")),
      quantitySold: parseInteger(readString(effectiveTransaction ?? undefined, "QuantityPurchased") ?? readString(sellingStatus, "QuantitySold")),
      soldAtUtc: normalizeDateTime(readString(effectiveTransaction, "CreatedDate") ?? readString(sellingStatus, "SaleTime")),
      buyerUsername: readString(buyer, "UserID"),
      source: "TRADING",
      writePath: "TRADING",
      listingUrl: readString(listingDetails, "ViewItemURL")
    };
  });
}

function parseLegacyListing(xml: string, marketplaceId: string): Record<string, unknown> {
  const parsed = tradingParser.parse(xml) as Record<string, unknown>;
  const root = firstObjectValue(parsed);
  ensureTradingSuccess(root, "GetItem");
  const item = asRecord(root.Item);
  if (!item) {
    throw new AppError("EBAY_API_ERROR", "Trading API GetItem response did not include an Item.", parsed);
  }

  const specifics: Record<string, string[]> = {};
  for (const entry of arrayify(asRecord(item.ItemSpecifics)?.NameValueList)) {
    const nameValue = asRecord(entry) ?? {};
    const name = readString(nameValue, "Name");
    if (!name) {
      continue;
    }
    specifics[name] = arrayify(nameValue.Value).map((value) => String(value));
  }

  const conditionDescriptors = arrayify(asRecord(item.ConditionDescriptors)?.ConditionDescriptor)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
    .map((descriptor) => {
      const name = readString(descriptor, "Name");
      const values = arrayify(descriptor.Value).map((value) => String(value)).filter((value) => value.length > 0);
      if (!name || values.length === 0) {
        return null;
      }
      return { name, values };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    source: "TRADING",
    marketplaceId,
    listingId: readString(item, "ItemID"),
    sku: readString(item, "SKU"),
    status: readString(asRecord(item.SellingStatus), "ListingStatus"),
    title: readString(item, "Title"),
    description: readString(item, "Description"),
    categoryId: readString(asRecord(item.PrimaryCategory), "CategoryID"),
    categoryName: readString(asRecord(item.PrimaryCategory), "CategoryName"),
    conditionId: readString(item, "ConditionID"),
    conditionDisplayName: readString(item, "ConditionDisplayName"),
    listingType: readString(item, "ListingType"),
    startPrice: parseNumber(readAmountValue(item.StartPrice)),
    priceCurrency: readAmountCurrency(item.StartPrice),
    quantity: parseInteger(readString(item, "Quantity")),
    quantityAvailable: parseInteger(readString(item, "QuantityAvailable")),
    quantitySold: parseInteger(readString(asRecord(item.SellingStatus), "QuantitySold")),
    startTimeUtc: normalizeDateTime(readString(asRecord(item.ListingDetails), "StartTime")),
    endTimeUtc: normalizeDateTime(readString(asRecord(item.ListingDetails), "EndTime")),
    viewItemUrl: readString(asRecord(item.ListingDetails), "ViewItemURL"),
    bestOfferEnabled: readString(asRecord(item.BestOfferDetails), "BestOfferEnabled"),
    listingDuration: readString(item, "ListingDuration"),
    location: readString(item, "Location"),
    postalCode: readString(item, "PostalCode"),
    country: readString(item, "Country"),
    dispatchTimeMax: parseInteger(readString(item, "DispatchTimeMax")),
    pictureUrls: arrayify(asRecord(item.PictureDetails)?.PictureURL).map((value) => String(value)),
    itemSpecifics: specifics,
    conditionDescriptors: conditionDescriptors.length > 0 ? conditionDescriptors : undefined
  };
}

function parseTradingResponseSummary(xml: string, callName: string): Record<string, unknown> {
  const parsed = tradingParser.parse(xml) as Record<string, unknown>;
  const root = firstObjectValue(parsed);
  ensureTradingSuccess(root, callName);
  const warnings = arrayify(root.Errors)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
    .map((entry) => readString(entry, "LongMessage") ?? readString(entry, "ShortMessage"))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return {
    callName,
    ack: readString(root, "Ack"),
    itemId: firstDescendantString(root, "ItemID"),
    sku: firstDescendantString(root, "SKU"),
    endTimeUtc: normalizeDateTime(firstDescendantString(root, "EndTime")),
    startTimeUtc: normalizeDateTime(firstDescendantString(root, "StartTime")),
    fees: normalizeFees(root.Fees),
    warnings
  };
}

function firstObjectValue(root: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(root)) {
    if (key.startsWith("?")) {
      continue;
    }

    const record = asRecord(value);
    if (record) {
      return record;
    }
  }

  const firstRecord = Object.values(root).map((value) => asRecord(value)).find((value) => value !== undefined);
  return firstRecord ?? root;
}

function firstDescendantString(root: Record<string, unknown>, key: string): string | undefined {
  if (typeof root[key] === "string") {
    return root[key] as string;
  }
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = asRecord(item) ? firstDescendantString(asRecord(item)!, key) : undefined;
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = firstDescendantString(value as Record<string, unknown>, key);
      if (found) return found;
    }
  }
  return undefined;
}

function arrayify<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeFees(value: unknown): Array<Record<string, unknown>> | undefined {
  const feeArray = arrayify(asRecord(value)?.Fee)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
    .map((fee) => ({
      name: readString(fee, "Name"),
      fee: parseNumber(readAmountValue(fee.Fee)),
      currency: readAmountCurrency(fee.Fee),
      promotionalDiscount: parseNumber(readAmountValue(fee.PromotionalDiscount)),
      promotionalDiscountCurrency: readAmountCurrency(fee.PromotionalDiscount)
    }));

  return feeArray.length > 0 ? feeArray : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const asObject = value as Record<string, unknown>;
    if (typeof asObject["#text"] === "string") return asObject["#text"];
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return undefined;
}

function readAmountValue(value: unknown): string | undefined {
  const record = asRecord(value);
  return record ? readString(record, "#text") ?? readString(record, "__text") : typeof value === "string" ? value : undefined;
}

function readAmountCurrency(value: unknown): string | undefined {
  const record = asRecord(value);
  return record ? readString(record, "@_currencyID") : undefined;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
