import { AppError } from "./errors.js";
import { type DoctorReportResponse, type ListingPatchRequest, type ListingSpecRequest, type ListingSummary, type LocalEbaySession, type MutationPlanResponse } from "./types.js";
import { EbayApiClient } from "./ebay-api.js";

type JsonObject = Record<string, unknown>;

interface ListingAggregate {
  sku: string;
  marketplaceId: string;
  inventoryItem: JsonObject | null;
  offer: JsonObject | null;
  listing: JsonObject | null;
  legacyItem: JsonObject | null;
  location: JsonObject | null;
}

export async function getConnectionStatusDirect(client: EbayApiClient, session: LocalEbaySession) {
  const user = await client.getUser(session.accessToken);
  const privileges = await client.getPrivileges(session.accessToken);
  return {
    storeOwnerSlug: "local",
    connected: true,
    environment: session.environment,
    marketplaceId: session.marketplaceId,
    ebayUserId: asString(user.userId),
    ebayUsername: asString(user.username),
    accountType: asString(user.accountType),
    sellerRegistrationCompleted: asBoolean(privileges.sellerRegistrationCompleted),
    accessTokenExpiresAtUtc: session.accessTokenExpiresAtUtc,
    connectedAtUtc: null,
    lastTokenRefreshAtUtc: null
  };
}

export async function runDoctorDirect(client: EbayApiClient, session: LocalEbaySession): Promise<DoctorReportResponse> {
  const checks: DoctorReportResponse["checks"] = [
    {
      name: "connection",
      ok: true,
      message: "Connected to eBay.",
      details: { marketplaceId: session.marketplaceId }
    }
  ];

  try {
    const privileges = await client.getPrivileges(session.accessToken);
    checks.push({
      name: "sellerPrivileges",
      ok: privileges.sellerRegistrationCompleted === true,
      message: privileges.sellerRegistrationCompleted === true
        ? "Seller registration is complete."
        : "Seller registration is incomplete or unavailable.",
      details: privileges
    });
  } catch (error) {
    checks.push(buildDoctorFailureCheck("sellerPrivileges", "Seller privileges could not be checked.", error));
  }

  let paymentPolicies: JsonObject | null = null;
  let fulfillmentPolicies: JsonObject | null = null;
  let returnPolicies: JsonObject | null = null;
  try {
    paymentPolicies = await client.getPaymentPolicies(session.accessToken, session.marketplaceId);
    fulfillmentPolicies = await client.getFulfillmentPolicies(session.accessToken, session.marketplaceId);
    returnPolicies = await client.getReturnPolicies(session.accessToken, session.marketplaceId);
  } catch (error) {
    if (tryBuildBusinessPolicyChecks(error, checks)) {
      // handled
    } else {
      checks.push(buildDoctorFailureCheck("paymentPolicies", "Business policies could not be checked.", error));
    }
  }

  let locations: JsonObject | null = null;
  try {
    locations = await client.getLocations(session.accessToken);
  } catch (error) {
    checks.push(buildDoctorFailureCheck("inventoryLocations", "Inventory locations could not be checked.", error));
  }

  if (paymentPolicies && fulfillmentPolicies && returnPolicies) {
    checks.push({
      name: "paymentPolicies",
      ok: readArray(paymentPolicies, "paymentPolicies").length > 0,
      message: "Payment policies checked.",
      details: paymentPolicies
    });
    checks.push({
      name: "fulfillmentPolicies",
      ok: readArray(fulfillmentPolicies, "fulfillmentPolicies").length > 0,
      message: "Fulfillment policies checked.",
      details: fulfillmentPolicies
    });
    checks.push({
      name: "returnPolicies",
      ok: readArray(returnPolicies, "returnPolicies").length > 0,
      message: "Return policies checked.",
      details: returnPolicies
    });
  }

  if (locations) {
    checks.push({
      name: "inventoryLocations",
      ok: readArray(locations, "locations").length > 0,
      message: "Inventory locations checked.",
      details: locations
    });
  }

  const tradingMode = await inferTradingMode(client, session);
  checks.push(tradingMode);

  return {
    storeOwnerSlug: "local",
    environment: session.environment,
    checks
  };
}

export async function syncPoliciesDirect(
  client: EbayApiClient,
  session: LocalEbaySession,
  options: {
    paymentPolicyId?: string;
    returnPolicyId?: string;
    fulfillmentPolicyId?: string;
    createPayload?: unknown;
  }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  if (isRecord(options.createPayload)) {
    const payload = options.createPayload;
    if (isRecord(payload.paymentPolicy)) {
      await client.createPaymentPolicy(session.accessToken, payload.paymentPolicy);
    }
    if (isRecord(payload.fulfillmentPolicy)) {
      await client.createFulfillmentPolicy(session.accessToken, payload.fulfillmentPolicy);
    }
    if (isRecord(payload.returnPolicy)) {
      await client.createReturnPolicy(session.accessToken, payload.returnPolicy);
    }
  }

  const paymentPolicies = await client.getPaymentPolicies(session.accessToken, session.marketplaceId);
  const fulfillmentPolicies = await client.getFulfillmentPolicies(session.accessToken, session.marketplaceId);
  const returnPolicies = await client.getReturnPolicies(session.accessToken, session.marketplaceId);

  const updatedSession: LocalEbaySession = {
    ...session,
    defaultPaymentPolicyId: options.paymentPolicyId ?? inferSingleId(paymentPolicies, "paymentPolicies", "paymentPolicyId") ?? session.defaultPaymentPolicyId,
    defaultReturnPolicyId: options.returnPolicyId ?? inferSingleId(returnPolicies, "returnPolicies", "returnPolicyId") ?? session.defaultReturnPolicyId,
    defaultFulfillmentPolicyId: options.fulfillmentPolicyId ?? inferSingleId(fulfillmentPolicies, "fulfillmentPolicies", "fulfillmentPolicyId") ?? session.defaultFulfillmentPolicyId
  };

  return {
    result: {
      paymentPolicies,
      fulfillmentPolicies,
      returnPolicies,
      defaults: {
        paymentPolicyId: updatedSession.defaultPaymentPolicyId,
        returnPolicyId: updatedSession.defaultReturnPolicyId,
        fulfillmentPolicyId: updatedSession.defaultFulfillmentPolicyId
      }
    },
    session: updatedSession
  };
}

export async function optInPolicyProgramDirect(client: EbayApiClient, session: LocalEbaySession, programType: string) {
  const result = await client.optInToProgram(session.accessToken, programType);
  return { programType, result };
}

export async function upsertLocationDirect(
  client: EbayApiClient,
  session: LocalEbaySession,
  options: { key?: string; payload?: unknown }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  if (!isRecord(options.payload)) {
    return {
      result: { merchantLocationKey: options.key },
      session: {
        ...session,
        ...(options.key ? { defaultLocationKey: options.key } : {})
      }
    };
  }

  const merchantLocationKey = options.key ?? asString(options.payload.merchantLocationKey);
  if (!merchantLocationKey) {
    throw new AppError("VALIDATION_ERROR", "merchantLocationKey is required.");
  }

  try {
    await client.createInventoryLocation(session.accessToken, merchantLocationKey, options.payload, "en-US", session.marketplaceId);
  } catch {
    await client.updateInventoryLocation(session.accessToken, merchantLocationKey, options.payload, "en-US", session.marketplaceId);
  }

  return {
    result: {
      merchantLocationKey,
      payload: options.payload
    },
    session: {
      ...session,
      defaultLocationKey: merchantLocationKey
    }
  };
}

export async function listListingsDirect(
  client: EbayApiClient,
  session: LocalEbaySession,
  options?: { status?: string; page?: number; limit?: number; days?: number }
): Promise<ListingSummary[]> {
  const effectivePage = options?.page ?? 1;
  const effectiveLimit = Math.max(1, Math.min(options?.limit ?? 100, 200));
  if (!options?.status || options.status.toUpperCase() === "ACTIVE") {
    return (await client.getActiveListings(session.accessToken, session.marketplaceId, effectivePage, effectiveLimit)) as ListingSummary[];
  }

  if (options.status.toUpperCase() === "SOLD") {
    return (await client.getSoldListings(session.accessToken, session.marketplaceId, Math.max(1, Math.min(options.days ?? 30, 60)), effectivePage, effectiveLimit)) as ListingSummary[];
  }

  const results: ListingSummary[] = [];
  let offset = 0;
  while (true) {
    const inventoryPage = await client.getInventoryItems(session.accessToken, 100, offset);
    const inventoryItems = readArray(inventoryPage, "inventoryItems");
    if (inventoryItems.length === 0) {
      break;
    }

    for (const inventoryItem of inventoryItems) {
      const sku = asString(inventoryItem.sku);
      if (!sku) {
        continue;
      }
      const offers = await client.getOffers(session.accessToken, sku);
      for (const offer of readArray(offers, "offers")) {
        if (options.status && asString(offer.status)?.toUpperCase() !== options.status.toUpperCase()) {
          continue;
        }
        results.push({
          sku,
          marketplaceId: asString(offer.marketplaceId) ?? session.marketplaceId,
          offerId: asString(offer.offerId) ?? null,
          listingId: asString(offer.listingId) ?? null,
          status: asString(offer.status) ?? null,
          title: asString(asRecord(inventoryItem.product)?.title) ?? null,
          priceValue: readDecimal(asRecord(asRecord(offer.pricingSummary)?.price)?.value),
          priceCurrency: asString(asRecord(asRecord(offer.pricingSummary)?.price)?.currency) ?? null,
          availableQuantity: readInt(asRecord(asRecord(inventoryItem.availability)?.shipToLocationAvailability)?.quantity),
          quantitySold: null,
          soldAtUtc: null,
          buyerUsername: null,
          source: "INVENTORY",
          writePath: "INVENTORY",
          listingUrl: null
        });
      }
    }

    offset += inventoryItems.length;
    if (inventoryItems.length < 100) {
      break;
    }
  }

  return results;
}

export async function getListingDirect(client: EbayApiClient, session: LocalEbaySession, reference: string) {
  const aggregate = await resolveAggregate(client, session, reference);
  const readSource = aggregate.legacyItem ? "TRADING" : "INVENTORY";
  const writePath = inferWritePath(aggregate);
  return {
    aggregate: {
      sku: aggregate.sku,
      marketplaceId: aggregate.marketplaceId,
      InventoryItem: aggregate.inventoryItem,
      Offer: aggregate.offer,
      Listing: aggregate.listing,
      LegacyItem: aggregate.legacyItem,
      Location: aggregate.location,
      Source: readSource,
      ReadSource: readSource,
      WritePath: writePath
    },
    spec: toListingSpec(aggregate, session.marketplaceId)
  };
}

export async function pullListingDirect(client: EbayApiClient, session: LocalEbaySession, reference: string) {
  const result = await getListingDirect(client, session, reference);
  return result.spec;
}

export function planCreateDirect(session: LocalEbaySession, request: ListingSpecRequest): MutationPlanResponse {
  validateCreateRequest(request);
  const writePath = request.writePath ?? "INVENTORY";
  const actions = [];
  for (const image of request.images ?? []) {
    actions.push({
      type: "uploadImage",
      description: image.url ? `Upload image from ${image.url}` : `Upload inline image ${image.fileName}`,
      payload: image
    });
  }
  if (writePath === "TRADING") {
    actions.push({
      type: "verifyAddFixedPriceItem",
      description: `Validate Trading payload for ${request.sku}`,
      payload: {
        sku: request.sku,
        marketplaceId: request.marketplaceId ?? session.marketplaceId,
        title: request.title,
        priceValue: request.priceValue
      }
    });
    actions.push({
      type: "addFixedPriceItem",
      description: `Create Trading listing for ${request.sku}`,
      payload: {
        sku: request.sku,
        marketplaceId: request.marketplaceId ?? session.marketplaceId,
        title: request.title,
        priceValue: request.priceValue
      }
    });
  } else {
    actions.push({
      type: "createInventoryItem",
      description: `Create or replace inventory item ${request.sku}`,
      payload: { sku: request.sku, availableQuantity: request.availableQuantity, title: request.title }
    });
    actions.push({
      type: "createOffer",
      description: `Create offer for ${request.sku}`,
      payload: {
        sku: request.sku,
        marketplaceId: request.marketplaceId ?? session.marketplaceId,
        priceValue: request.priceValue,
        currency: request.priceCurrency ?? "USD"
      }
    });
    actions.push({
      type: "publishOffer",
      description: `Publish offer for ${request.sku}`,
      payload: null
    });
  }
  return {
    mode: "create",
    environment: session.environment,
    storeOwnerSlug: "local",
    marketplaceId: request.marketplaceId ?? session.marketplaceId,
    target: { sku: request.sku, writePath },
    actions,
    warnings: []
  };
}

export async function verifyCreateDirect(client: EbayApiClient, session: LocalEbaySession, request: ListingSpecRequest) {
  validateCreateRequest(request);
  const writePath = request.writePath ?? "INVENTORY";
  if (writePath !== "TRADING") {
    return {
      writePath,
      verified: false,
      reason: "Remote create verification is currently implemented only for Trading create flows.",
      plan: planCreateDirect(session, request)
    };
  }

  const imageUrls = await prepareTradingImageUrls(client, session, request.images ?? []);
  const payload = buildTradingAddPayload(session, request, imageUrls);
  try {
    const result = await client.verifyAddFixedPriceItem(
      session.accessToken,
      request.marketplaceId ?? session.marketplaceId,
      payload
    );

    return {
      writePath,
      verified: true,
      payload,
      result
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        writePath,
        verified: false,
        payload,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      };
    }

    throw error;
  }
}

export async function createListingDirect(client: EbayApiClient, session: LocalEbaySession, request: ListingSpecRequest) {
  validateCreateRequest(request);
  const effectiveMarketplaceId = request.marketplaceId ?? session.marketplaceId;
  const writePath = request.writePath ?? "INVENTORY";

  if (writePath === "TRADING") {
    const imageUrls = await prepareTradingImageUrls(client, session, request.images ?? []);
    const addPayload = buildTradingAddPayload(session, request, imageUrls);
    let verification: unknown;
    try {
      verification = await client.verifyAddFixedPriceItem(session.accessToken, effectiveMarketplaceId, addPayload);
    } catch (error) {
      if (!isWarningOnlyTradingFailure(error)) {
        throw error;
      }
      verification = {
        warningOnly: true,
        ...(error instanceof AppError
          ? {
              code: error.code,
              message: error.message,
              details: error.details
            }
          : {})
      };
    }
    const result = await client.addFixedPriceItem(session.accessToken, effectiveMarketplaceId, addPayload);
    return {
      sku: request.sku,
      listingId: asString(result.itemId) ?? undefined,
      source: "TRADING",
      verification,
      result
    };
  }

  const uploadedImages = await uploadImages(client, session, request.images ?? []);
  const inventoryPayload = buildInventoryPayload(request, uploadedImages);
  const offerPayload = buildOfferPayload(session, request);
  await client.upsertInventoryItem(session.accessToken, request.sku, inventoryPayload, request.locale, effectiveMarketplaceId);

  let offer: JsonObject;
  try {
    offer = await client.createOffer(session.accessToken, offerPayload, request.locale, effectiveMarketplaceId) as JsonObject;
  } catch (error) {
    if (!isAlreadyExistingOfferError(error)) {
      throw error;
    }
    offer = await recoverExistingOffer(client, session, request, effectiveMarketplaceId);
  }

  const offerId = asString(offer.offerId);
  if (!offerId) {
    throw new AppError("EBAY_API_ERROR", "eBay did not return an offerId.");
  }
  let listingId: string | undefined = asString(offer.listingId) ?? undefined;
  let publish: unknown = null;
  if (!listingId) {
    publish = await client.publishOffer(session.accessToken, offerId);
    listingId = asString(asRecord(publish)?.listingId) ?? undefined;
  }

  return {
    sku: request.sku,
    offerId,
    listingId,
    source: "INVENTORY",
    publish
  };
}

export async function planUpdateDirect(client: EbayApiClient, session: LocalEbaySession, reference: string, request: ListingPatchRequest): Promise<MutationPlanResponse> {
  const aggregate = await resolveAggregate(client, session, reference);
  const current = toListingSpec(aggregate, session.marketplaceId);
  const merged = merge(current, request);
  const actions = [];
  if (request.images) {
    for (const image of request.images) {
      actions.push({
        type: "uploadImage",
        description: `Upload ${image.url ?? image.fileName ?? "image"}`,
        payload: image
      });
    }
  }

  if (aggregate.legacyItem) {
    if (isPriceQuantityOnly(request)) {
      actions.push({
        type: "reviseInventoryStatus",
        description: `Update price/quantity for legacy listing ${asString(aggregate.legacyItem.listingId)}`,
        payload: {
          sku: aggregate.sku,
          listingId: asString(aggregate.legacyItem.listingId),
          priceValue: merged.priceValue,
          availableQuantity: merged.availableQuantity
        }
      });
    } else {
      actions.push({
        type: "reviseFixedPriceItem",
        description: `Revise legacy listing ${asString(aggregate.legacyItem.listingId)}`,
        payload: {
          sku: aggregate.sku,
          listingId: asString(aggregate.legacyItem.listingId),
          title: merged.title,
          priceValue: merged.priceValue
        }
      });
    }
  } else if (isPriceQuantityOnly(request)) {
    actions.push({
      type: "bulkUpdatePriceQuantity",
      description: `Update price/quantity for ${aggregate.sku}`,
      payload: {
        sku: aggregate.sku,
        offerId: asString(aggregate.offer?.offerId),
        priceValue: merged.priceValue,
        availableQuantity: merged.availableQuantity
      }
    });
  } else {
    actions.push({ type: "replaceInventoryItem", description: `Replace inventory item ${aggregate.sku}`, payload: { sku: aggregate.sku } });
    actions.push({ type: "updateOffer", description: `Update offer ${asString(aggregate.offer?.offerId)}`, payload: { sku: aggregate.sku } });
  }

  return {
    mode: "update",
    environment: session.environment,
    storeOwnerSlug: "local",
    marketplaceId: aggregate.marketplaceId,
    target: {
      sku: aggregate.sku,
      offerId: asString(aggregate.offer?.offerId),
      listingId: asString(aggregate.offer?.listingId) ?? asString(aggregate.legacyItem?.listingId),
      source: aggregate.legacyItem ? "TRADING" : "INVENTORY"
    },
    actions,
    warnings: []
  };
}

export async function updateListingDirect(client: EbayApiClient, session: LocalEbaySession, reference: string, request: ListingPatchRequest) {
  const aggregate = await resolveAggregate(client, session, reference);
  const current = toListingSpec(aggregate, session.marketplaceId);
  const merged = merge(current, request);
  validateCreateRequest(merged);

  if (aggregate.legacyItem) {
    if (isPriceQuantityOnly(request)) {
      const result = await client.reviseInventoryStatus(
        session.accessToken,
        aggregate.marketplaceId,
        asString(aggregate.legacyItem.listingId) ?? fail("No listingId found for legacy listing."),
        asString(aggregate.legacyItem.sku) ?? aggregate.sku,
        request.priceValue ?? merged.priceValue,
        request.priceCurrency ?? merged.priceCurrency ?? "USD",
        request.availableQuantity ?? merged.availableQuantity
      );
      return { sku: aggregate.sku, listingId: asString(aggregate.legacyItem.listingId), source: "TRADING", result };
    }

    const legacyImages = request.images === undefined
      ? ((aggregate.legacyItem.pictureUrls as string[] | undefined) ?? [])
      : await uploadImages(client, session, request.images);

    const revisePayload = buildLegacyRevisePayload(aggregate, merged, legacyImages, session);
    const result = await client.reviseFixedPriceItem(session.accessToken, aggregate.marketplaceId, revisePayload);
    return { sku: aggregate.sku, listingId: asString(aggregate.legacyItem.listingId), source: "TRADING", result };
  }

  const offerId = asString(aggregate.offer?.offerId);
  if (!offerId) {
    throw new AppError("VALIDATION_ERROR", "No offer found for listing.");
  }
  if (isPriceQuantityOnly(request)) {
    const payload = {
      requests: [
        {
          sku: aggregate.sku,
          shipToLocationAvailability: {
            quantity: merged.availableQuantity
          },
          offers: [
            {
              offerId,
              availableQuantity: merged.availableQuantity,
              price: {
                value: merged.priceValue,
                currency: merged.priceCurrency ?? "USD"
              }
            }
          ]
        }
      ]
    };
    return await client.bulkUpdatePriceQuantity(session.accessToken, payload);
  }

  const images = request.images === undefined
    ? arrayOfStrings(asRecord(aggregate.inventoryItem?.product)?.imageUrls)
    : await uploadImages(client, session, request.images);
  const effectiveMarketplaceId = merged.marketplaceId ?? session.marketplaceId;
  await client.upsertInventoryItem(session.accessToken, aggregate.sku, buildInventoryPayload(merged, images), merged.locale, effectiveMarketplaceId);
  await client.updateOffer(session.accessToken, offerId, buildOfferPayload(session, merged), merged.locale, effectiveMarketplaceId);
  return { sku: aggregate.sku, offerId, updated: true };
}

export async function planEndDirect(client: EbayApiClient, session: LocalEbaySession, reference: string): Promise<MutationPlanResponse> {
  const aggregate = await resolveAggregate(client, session, reference);
  if (aggregate.legacyItem) {
    return {
      mode: "end",
      environment: session.environment,
      storeOwnerSlug: "local",
      marketplaceId: aggregate.marketplaceId,
      target: { sku: aggregate.sku, listingId: asString(aggregate.legacyItem.listingId) },
      actions: [
        {
          type: "endFixedPriceItem",
          description: `End listing ${asString(aggregate.legacyItem.listingId)}`,
          payload: { listingId: asString(aggregate.legacyItem.listingId), endingReason: "NotAvailable" }
        }
      ],
      warnings: []
    };
  }

  return {
    mode: "end",
    environment: session.environment,
    storeOwnerSlug: "local",
    marketplaceId: aggregate.marketplaceId,
    target: { sku: aggregate.sku, offerId: asString(aggregate.offer?.offerId), listingId: asString(aggregate.offer?.listingId) },
    actions: [
      { type: "withdrawOffer", description: `Withdraw offer ${asString(aggregate.offer?.offerId)}`, payload: null }
    ],
    warnings: []
  };
}

export async function endListingDirect(client: EbayApiClient, session: LocalEbaySession, reference: string) {
  const aggregate = await resolveAggregate(client, session, reference);
  if (aggregate.legacyItem) {
    const result = await client.endFixedPriceItem(
      session.accessToken,
      aggregate.marketplaceId,
      asString(aggregate.legacyItem.listingId) ?? fail("No listingId found for legacy listing."),
      "NotAvailable"
    );
    return { sku: aggregate.sku, listingId: asString(aggregate.legacyItem.listingId), source: "TRADING", result };
  }

  const offerId = asString(aggregate.offer?.offerId);
  if (!offerId) {
    throw new AppError("VALIDATION_ERROR", "No offer found for listing.");
  }
  await client.withdrawOffer(session.accessToken, offerId);
  return { sku: aggregate.sku, offerId, withdrawn: true };
}

async function inferTradingMode(client: EbayApiClient, session: LocalEbaySession) {
  try {
    const active = await client.getActiveListings(session.accessToken, session.marketplaceId, 1, 5);
    const hasTradingListings = active.some((item) => item.source === "TRADING");
    return {
      name: "listingModel",
      ok: true,
      message: hasTradingListings ? "Classic Trading listings are available on this account." : "No Trading listings were detected in the first page sample.",
      details: {
        recommendedWritePath: hasTradingListings ? "TRADING for existing classic listings; INVENTORY for new listings once policies/location exist." : "INVENTORY",
        sampledListings: active.length
      }
    };
  } catch (error) {
    return buildDoctorFailureCheck("listingModel", "Listing model could not be inferred.", error);
  }
}

function tryBuildBusinessPolicyChecks(error: unknown, checks: DoctorReportResponse["checks"]): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.toLowerCase().includes("business policy") && !message.toLowerCase().includes("not eligible")) {
    return false;
  }
  checks.push({ name: "paymentPolicies", ok: false, message: "This account is not eligible for Business Policies.", details: { reason: message } });
  checks.push({ name: "fulfillmentPolicies", ok: false, message: "This account is not eligible for Business Policies.", details: { reason: message } });
  checks.push({ name: "returnPolicies", ok: false, message: "This account is not eligible for Business Policies.", details: { reason: message } });
  return true;
}

function buildDoctorFailureCheck(name: string, message: string, error: unknown) {
  return {
    name,
    ok: false,
    message,
    details: {
      error: error instanceof Error ? error.message : String(error)
    }
  };
}

async function resolveAggregate(client: EbayApiClient, session: LocalEbaySession, reference: string): Promise<ListingAggregate> {
  const parsed = parseReference(reference);
  if (parsed.kind === "sku") {
    let inventoryItem: JsonObject | null = null;
    try {
      inventoryItem = await client.getInventoryItem(session.accessToken, parsed.value) as JsonObject;
    } catch {
      inventoryItem = null;
    }
    const offers = await client.getOffers(session.accessToken, parsed.value);
    const offer = readArray(offers, "offers")[0] ?? null;
    let listing: JsonObject | null = null;
    let location: JsonObject | null = null;
    if (offer && asString(offer.listingId)) {
      listing = await client.getListing(session.accessToken, asString(offer.listingId)! ) as JsonObject;
    }
    if (offer && asString(offer.merchantLocationKey)) {
      location = await resolveLocationForKey(client, session, asString(offer.merchantLocationKey)!);
    }

    if (!inventoryItem && !offer) {
      throw new AppError("VALIDATION_ERROR", `No listing found for reference '${reference}'.`);
    }
    return {
      sku: parsed.value,
      marketplaceId: asString(offer?.marketplaceId) ?? session.marketplaceId,
      inventoryItem,
      offer,
      listing,
      legacyItem: null,
      location
    };
  }

  if (parsed.kind === "offer") {
    const offer = await client.getOffer(session.accessToken, parsed.value) as JsonObject;
    const sku = asString(offer.sku);
    if (!sku) {
      throw new AppError("EBAY_API_ERROR", "Offer response did not include sku.");
    }
    const inventoryItem = await client.getInventoryItem(session.accessToken, sku) as JsonObject;
    let listing: JsonObject | null = null;
    let location: JsonObject | null = null;
    if (asString(offer.listingId)) {
      listing = await client.getListing(session.accessToken, asString(offer.listingId)! ) as JsonObject;
    }
    if (asString(offer.merchantLocationKey)) {
      location = await resolveLocationForKey(client, session, asString(offer.merchantLocationKey)!);
    }
    return { sku, marketplaceId: asString(offer.marketplaceId) ?? session.marketplaceId, inventoryItem, offer, listing, legacyItem: null, location };
  }

  try {
    const listingById = await client.getListing(session.accessToken, parsed.value) as JsonObject;
    const listingSku = asString(listingById.sku);
    if (!listingSku) {
      throw new AppError("EBAY_API_ERROR", "Listing response did not include sku.");
    }
    const inventoryItem = await client.getInventoryItem(session.accessToken, listingSku) as JsonObject;
    const offersBySku = await client.getOffers(session.accessToken, listingSku);
    const offer = readArray(offersBySku, "offers").find((item) => asString(item.listingId) === parsed.value) ?? readArray(offersBySku, "offers")[0] ?? null;
    const location = asString(offer?.merchantLocationKey)
      ? await resolveLocationForKey(client, session, asString(offer?.merchantLocationKey)!)
      : null;
    return { sku: listingSku, marketplaceId: asString(offer?.marketplaceId) ?? session.marketplaceId, inventoryItem, offer, listing: listingById, legacyItem: null, location };
  } catch (inventoryListingError) {
    try {
      const legacyItem = await client.getLegacyListing(session.accessToken, session.marketplaceId, parsed.value) as JsonObject;
      const legacySku = asString(legacyItem.sku) ?? parsed.value;
      return { sku: legacySku, marketplaceId: asString(legacyItem.marketplaceId) ?? session.marketplaceId, inventoryItem: null, offer: null, listing: null, legacyItem, location: null };
    } catch (tradingGetItemError) {
      const inventoryMessage = inventoryListingError instanceof Error ? inventoryListingError.message : String(inventoryListingError);
      const tradingMessage = tradingGetItemError instanceof Error ? tradingGetItemError.message : String(tradingGetItemError);
      throw new AppError(
        "EBAY_API_ERROR",
        `Could not resolve listing '${parsed.value}' through Inventory or Trading GetItem.`,
        {
          inventoryListingError: inventoryMessage,
          tradingGetItemError: tradingMessage
        }
      );
    }
  }
}

function parseReference(reference: string) {
  if (reference.toLowerCase().startsWith("sku:")) return { kind: "sku", value: reference.slice(4) };
  if (reference.toLowerCase().startsWith("offer:")) return { kind: "offer", value: reference.slice(6) };
  if (reference.toLowerCase().startsWith("listing:")) return { kind: "listing", value: reference.slice(8) };
  if (/^\d{9,}$/.test(reference)) return { kind: "listing", value: reference };
  return { kind: "sku", value: reference };
}

function toListingSpec(aggregate: ListingAggregate, fallbackMarketplaceId: string): ListingSpecRequest {
  if (aggregate.legacyItem) {
    const legacyImages = arrayOfStrings(aggregate.legacyItem.pictureUrls).map((url) => ({ url }));
    const legacyAspects: Record<string, string[]> = {};
    if (isRecord(aggregate.legacyItem.itemSpecifics)) {
      for (const [key, value] of Object.entries(aggregate.legacyItem.itemSpecifics)) {
        legacyAspects[key] = arrayOfStrings(value);
      }
    }
    return {
      sku: asString(aggregate.legacyItem.sku) ?? aggregate.sku,
      writePath: "TRADING",
      marketplaceId: asString(aggregate.legacyItem.marketplaceId) ?? aggregate.marketplaceId ?? fallbackMarketplaceId,
      title: asString(aggregate.legacyItem.title) ?? "",
      description: asString(aggregate.legacyItem.description) ?? "",
      categoryId: asString(aggregate.legacyItem.categoryId) ?? "",
      condition: asString(aggregate.legacyItem.conditionId) ?? "USED_GOOD",
      conditionDescription: undefined,
      format: asString(aggregate.legacyItem.listingType) ?? undefined,
      priceValue: readDecimal(aggregate.legacyItem.startPrice) ?? 0,
      priceCurrency: asString(aggregate.legacyItem.priceCurrency) ?? "USD",
      availableQuantity: readInt(aggregate.legacyItem.quantityAvailable) ?? readInt(aggregate.legacyItem.quantity) ?? 0,
      policies: undefined,
      locationKey: undefined,
      location: asString(aggregate.legacyItem.location) ?? undefined,
      postalCode: asString(aggregate.legacyItem.postalCode) ?? undefined,
      country: asString(aggregate.legacyItem.country) ?? undefined,
      dispatchTimeMax: readInt(aggregate.legacyItem.dispatchTimeMax) ?? undefined,
      bestOfferEnabled: readLegacyBestOfferEnabled(aggregate.legacyItem.bestOfferEnabled),
      minimumBestOfferPrice: undefined,
      autoAcceptPrice: undefined,
      images: legacyImages,
      aspects: legacyAspects,
      packageWeightAndSize: undefined,
      conditionDescriptors: normalizeConditionDescriptorsFromInventory(aggregate.legacyItem.conditionDescriptors),
      locale: undefined
    };
  }

  const inventoryProduct = asRecord(aggregate.inventoryItem?.product);
  const availability = asRecord(asRecord(aggregate.inventoryItem?.availability)?.shipToLocationAvailability);
  const images = arrayOfStrings(inventoryProduct?.imageUrls).map((url) => ({ url }));
  const aspects: Record<string, string[]> = {};
  if (isRecord(inventoryProduct?.aspects)) {
    for (const [key, value] of Object.entries(inventoryProduct.aspects)) {
      aspects[key] = arrayOfStrings(value);
    }
  }

  return {
    sku: aggregate.sku,
    writePath: "INVENTORY",
    marketplaceId: asString(aggregate.offer?.marketplaceId) ?? aggregate.marketplaceId ?? fallbackMarketplaceId,
    title: asString(inventoryProduct?.title) ?? "",
    description: asString(inventoryProduct?.description) ?? "",
    categoryId: asString(aggregate.offer?.categoryId) ?? "",
    condition: asString(aggregate.inventoryItem?.condition) ?? "USED_GOOD",
    conditionDescription: asString(aggregate.inventoryItem?.conditionDescription) ?? undefined,
    format: asString(aggregate.offer?.format) ?? undefined,
    priceValue: readDecimal(asRecord(asRecord(aggregate.offer?.pricingSummary)?.price)?.value) ?? 0,
    priceCurrency: asString(asRecord(asRecord(aggregate.offer?.pricingSummary)?.price)?.currency) ?? "USD",
    availableQuantity: readInt(availability?.quantity) ?? 0,
    policies: {
      paymentPolicyId: asString(aggregate.offer?.listingPolicies ? asRecord(aggregate.offer.listingPolicies)?.paymentPolicyId : undefined) ?? undefined,
      returnPolicyId: asString(aggregate.offer?.listingPolicies ? asRecord(aggregate.offer.listingPolicies)?.returnPolicyId : undefined) ?? undefined,
      fulfillmentPolicyId: asString(aggregate.offer?.listingPolicies ? asRecord(aggregate.offer.listingPolicies)?.fulfillmentPolicyId : undefined) ?? undefined
    },
    locationKey: asString(aggregate.offer?.merchantLocationKey) ?? undefined,
    location: asString(asRecord(aggregate.location?.location)?.address ? formatLocation(asRecord(asRecord(aggregate.location?.location)?.address)) : undefined) ?? undefined,
    postalCode: asString(asRecord(asRecord(aggregate.location?.location)?.address)?.postalCode) ?? undefined,
    country: asString(asRecord(asRecord(aggregate.location?.location)?.address)?.country) ?? undefined,
    dispatchTimeMax: undefined,
    bestOfferEnabled: undefined,
    minimumBestOfferPrice: undefined,
    autoAcceptPrice: undefined,
    images,
    aspects,
    packageWeightAndSize: undefined,
    conditionDescriptors: normalizeConditionDescriptorsFromInventory(aggregate.inventoryItem?.conditionDescriptors),
    locale: undefined
  };
}

function merge(current: ListingSpecRequest, patch: ListingPatchRequest): ListingSpecRequest {
  return {
    ...current,
    ...patch,
    priceValue: patch.priceValue ?? current.priceValue,
    availableQuantity: patch.availableQuantity ?? current.availableQuantity,
    policies: patch.policies ?? current.policies,
    location: patch.location ?? current.location,
    postalCode: patch.postalCode ?? current.postalCode,
    country: patch.country ?? current.country,
    images: patch.images ?? current.images,
    aspects: patch.aspects ?? current.aspects,
    conditionDescriptors: patch.conditionDescriptors ?? current.conditionDescriptors
  };
}

function validateCreateRequest(request: ListingSpecRequest) {
  if (!request.sku || !request.title || !request.description || !request.categoryId || !request.condition) {
    throw new AppError("VALIDATION_ERROR", "Listing requests require sku, title, description, categoryId, and condition.");
  }
  if (request.priceValue <= 0) {
    throw new AppError("VALIDATION_ERROR", "Listing price must be greater than zero.");
  }
  if (request.availableQuantity < 0) {
    throw new AppError("VALIDATION_ERROR", "Available quantity must be zero or greater.");
  }
  if (request.writePath === "TRADING") {
    if (!request.country) {
      throw new AppError("VALIDATION_ERROR", "Trading create requests require `country`.");
    }
    if (!request.location && !request.postalCode) {
      throw new AppError("VALIDATION_ERROR", "Trading create requests require either `location` or `postalCode`.");
    }
  }
}

async function uploadImages(client: EbayApiClient, session: LocalEbaySession, images: NonNullable<ListingSpecRequest["images"]>) {
  const uploaded: string[] = [];
  for (const image of images) {
    let response: Record<string, unknown>;
    if (image.url) {
      response = await client.createImageFromUrl(session.accessToken, image.url);
    } else if (image.base64Content) {
      response = await client.createImageFromFile(
        session.accessToken,
        Buffer.from(image.base64Content, "base64"),
        image.fileName ?? "image.bin",
        image.contentType ?? "application/octet-stream"
      );
    } else {
      throw new AppError("VALIDATION_ERROR", "Each image must include either url or base64Content.");
    }
    const imageUrl = asString(response.imageUrl);
    if (!imageUrl) {
      throw new AppError("EBAY_API_ERROR", "eBay media upload did not return an imageUrl.");
    }
    uploaded.push(imageUrl);
  }
  return uploaded;
}

async function prepareTradingImageUrls(client: EbayApiClient, session: LocalEbaySession, images: NonNullable<ListingSpecRequest["images"]>) {
  const prepared: string[] = [];
  for (const image of images) {
    if (image.url) {
      prepared.push(image.url);
      continue;
    }

    if (image.base64Content) {
      const response = await client.createImageFromFile(
        session.accessToken,
        Buffer.from(image.base64Content, "base64"),
        image.fileName ?? "image.bin",
        image.contentType ?? "application/octet-stream"
      );
      const imageUrl = asString(response.imageUrl);
      if (!imageUrl) {
        throw new AppError("EBAY_API_ERROR", "eBay media upload did not return an imageUrl.");
      }
      prepared.push(imageUrl);
      continue;
    }

    throw new AppError("VALIDATION_ERROR", "Each image must include either url or base64Content.");
  }
  return prepared;
}

async function recoverExistingOffer(client: EbayApiClient, session: LocalEbaySession, request: ListingSpecRequest, effectiveMarketplaceId: string) {
  const offers = await client.getOffers(session.accessToken, request.sku);
  const matching = readArray(offers, "offers").find((offer) => asString(offer.marketplaceId) === effectiveMarketplaceId);
  if (!matching) {
    throw new AppError("EBAY_API_ERROR", `eBay reported that an offer already exists for SKU '${request.sku}', but no matching offer could be resolved.`);
  }
  return matching;
}

async function resolveLocationForKey(client: EbayApiClient, session: LocalEbaySession, merchantLocationKey: string) {
  const locations = await client.getLocations(session.accessToken);
  return readArray(locations, "locations").find((location) => asString(location.merchantLocationKey) === merchantLocationKey) ?? null;
}

function isAlreadyExistingOfferError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Offer entity already exists");
}

function buildInventoryPayload(request: ListingSpecRequest, imageUrls: string[]) {
  return {
    availability: {
      shipToLocationAvailability: {
        quantity: request.availableQuantity
      }
    },
    condition: request.condition,
    ...(request.conditionDescription ? { conditionDescription: request.conditionDescription } : {}),
    product: {
      title: request.title,
      description: request.description,
      imageUrls,
      ...(request.aspects ? { aspects: request.aspects } : {})
    },
    ...(request.packageWeightAndSize ? { packageWeightAndSize: request.packageWeightAndSize } : {}),
    ...(request.conditionDescriptors
      ? {
          conditionDescriptors: request.conditionDescriptors.map((descriptor) => ({
            name: descriptor.name,
            values: descriptor.values
          }))
        }
      : {})
  };
}

function buildOfferPayload(session: LocalEbaySession, request: ListingSpecRequest) {
  return {
    sku: request.sku,
    marketplaceId: request.marketplaceId ?? session.marketplaceId,
    format: request.format ?? "FIXED_PRICE",
    availableQuantity: request.availableQuantity,
    categoryId: request.categoryId,
    merchantLocationKey: request.locationKey ?? session.defaultLocationKey,
    pricingSummary: {
      price: {
        value: request.priceValue,
        currency: request.priceCurrency ?? "USD"
      }
    },
    listingDescription: request.description,
    ...(request.policies ?? session.defaultPaymentPolicyId ?? session.defaultReturnPolicyId ?? session.defaultFulfillmentPolicyId
      ? {
          listingPolicies: {
            paymentPolicyId: request.policies?.paymentPolicyId ?? session.defaultPaymentPolicyId,
            returnPolicyId: request.policies?.returnPolicyId ?? session.defaultReturnPolicyId,
            fulfillmentPolicyId: request.policies?.fulfillmentPolicyId ?? session.defaultFulfillmentPolicyId
          }
        }
      : {})
  };
}

function buildTradingAddPayload(session: LocalEbaySession, request: ListingSpecRequest, imageUrls: string[]) {
  const specifics = Object.entries(request.aspects ?? {}).map(([name, values]) => ({
    Name: name,
    Value: values
  }));

  const payload: Record<string, unknown> = {
    Item: {
      SKU: request.sku,
      InventoryTrackingMethod: "SKU",
      Title: request.title,
      Description: request.description,
      PrimaryCategory: {
        CategoryID: request.categoryId
      },
      StartPrice: {
        "#text": String(request.priceValue),
        "@_currencyID": request.priceCurrency ?? "USD"
      },
      CategoryMappingAllowed: true,
      Country: request.country,
      Currency: request.priceCurrency ?? "USD",
      DispatchTimeMax: request.dispatchTimeMax ?? 1,
      ListingDuration: "GTC",
      ListingType: "FixedPriceItem",
      Quantity: request.availableQuantity,
      ...(request.location ? { Location: request.location } : {}),
      ...(request.postalCode ? { PostalCode: request.postalCode } : {}),
      ...(imageUrls.length > 0 ? { PictureDetails: { PictureURL: imageUrls } } : {}),
      ...(specifics.length > 0 ? { ItemSpecifics: { NameValueList: specifics } } : {}),
      ...(request.condition ? { ConditionID: request.condition } : {}),
      ...(buildTradingConditionDescriptors(request.conditionDescriptors)),
      ...(buildTradingBusinessPolicies(session, request)),
      ...(request.bestOfferEnabled !== undefined ? { BestOfferDetails: { BestOfferEnabled: request.bestOfferEnabled } } : {}),
      ...(buildTradingListingDetails(request))
    }
  };

  return payload;
}

function buildTradingBusinessPolicies(session: LocalEbaySession, request: ListingSpecRequest) {
  const paymentPolicyId = request.policies?.paymentPolicyId ?? session.defaultPaymentPolicyId;
  const returnPolicyId = request.policies?.returnPolicyId ?? session.defaultReturnPolicyId;
  const fulfillmentPolicyId = request.policies?.fulfillmentPolicyId ?? session.defaultFulfillmentPolicyId;

  if (!paymentPolicyId || !returnPolicyId || !fulfillmentPolicyId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Trading create requests require payment, return, and fulfillment policy ids either in the draft or in saved session defaults."
    );
  }

  return {
    SellerProfiles: {
      SellerPaymentProfile: { PaymentProfileID: paymentPolicyId },
      SellerReturnProfile: { ReturnProfileID: returnPolicyId },
      SellerShippingProfile: { ShippingProfileID: fulfillmentPolicyId }
    }
  };
}

function buildTradingConditionDescriptors(descriptors: ListingSpecRequest["conditionDescriptors"]) {
  if (!descriptors || descriptors.length === 0) {
    return {};
  }

  return {
    ConditionDescriptors: {
      ConditionDescriptor: descriptors.map((descriptor) => ({
        Name: descriptor.name,
        Value: descriptor.values
      }))
    }
  };
}

function buildTradingListingDetails(request: ListingSpecRequest) {
  if (request.minimumBestOfferPrice === undefined && request.autoAcceptPrice === undefined) {
    return {};
  }

  return {
    ListingDetails: {
      ...(request.minimumBestOfferPrice !== undefined
        ? {
            MinimumBestOfferPrice: {
              "#text": String(request.minimumBestOfferPrice),
              "@_currencyID": request.priceCurrency ?? "USD"
            }
          }
        : {}),
      ...(request.autoAcceptPrice !== undefined
        ? {
            BestOfferAutoAcceptPrice: {
              "#text": String(request.autoAcceptPrice),
              "@_currencyID": request.priceCurrency ?? "USD"
            }
          }
        : {})
    }
  };
}

function buildLegacyRevisePayload(aggregate: ListingAggregate, merged: ListingSpecRequest, imageUrls: string[], session: LocalEbaySession) {
  const specifics = Object.entries(merged.aspects ?? {}).map(([name, values]) => ({
    Name: name,
    Value: values
  }));

  const sellerProfiles = buildTradingBusinessPolicies(session, merged);
  const listingDetails = buildTradingListingDetails(merged);

  return {
    Item: {
      ItemID: asString(aggregate.legacyItem?.listingId),
      ...(aggregate.sku ? { SKU: aggregate.sku } : {}),
      Title: merged.title,
      Description: merged.description,
      PrimaryCategory: {
        CategoryID: merged.categoryId
      },
      StartPrice: {
        "#text": String(merged.priceValue),
        "@_currencyID": merged.priceCurrency ?? "USD"
      },
      ...(merged.country ? { Country: merged.country } : {}),
      ...(merged.postalCode ? { PostalCode: merged.postalCode } : {}),
      ...(merged.location ? { Location: merged.location } : {}),
      ...(merged.dispatchTimeMax !== undefined ? { DispatchTimeMax: merged.dispatchTimeMax } : {}),
      Quantity: merged.availableQuantity,
      ...(imageUrls.length > 0 ? { PictureDetails: { PictureURL: imageUrls } } : {}),
      ...(specifics.length > 0 ? { ItemSpecifics: { NameValueList: specifics } } : {}),
      ...(merged.condition ? { ConditionID: merged.condition } : {}),
      ...(buildTradingConditionDescriptors(merged.conditionDescriptors)),
      ...(sellerProfiles),
      ...(merged.bestOfferEnabled !== undefined ? { BestOfferDetails: { BestOfferEnabled: merged.bestOfferEnabled } } : {}),
      ...(listingDetails)
    }
  };
}

function inferWritePath(aggregate: ListingAggregate): "INVENTORY" | "TRADING" {
  return aggregate.legacyItem ? "TRADING" : "INVENTORY";
}

function normalizeConditionDescriptorsFromInventory(value: unknown): ListingSpecRequest["conditionDescriptors"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonObject => entry !== undefined)
    .map((entry) => {
      const name = asString(entry.name);
      const values = arrayOfStrings(entry.values);
      if (!name || values.length === 0) {
        return null;
      }

      return {
        name,
        values
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function formatLocation(address: JsonObject | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  const parts = [
    asString(address.city),
    asString(address.stateOrProvince)
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function readLegacyBestOfferEnabled(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return undefined;
}

function isWarningOnlyTradingFailure(error: unknown): boolean {
  if (!(error instanceof AppError) || !isRecord(error.details)) {
    return false;
  }

  const errors = Array.isArray(error.details.Errors)
    ? error.details.Errors
    : error.details.Errors !== undefined
      ? [error.details.Errors]
      : [];

  if (errors.length === 0) {
    return false;
  }

  return errors.every((entry) => asString(asRecord(entry)?.SeverityCode) === "Warning");
}

function inferSingleId(source: JsonObject, arrayKey: string, idKey: string): string | undefined {
  const items = readArray(source, arrayKey);
  if (items.length === 1) {
    return asString(items[0]?.[idKey]) ?? undefined;
  }
  return undefined;
}

function readArray(source: unknown, key: string): JsonObject[] {
  if (!isRecord(source)) return [];
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as JsonObject[];
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter((item) => item.length > 0);
}

function readDecimal(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asRecord(value: unknown): JsonObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPriceQuantityOnly(request: ListingPatchRequest): boolean {
  const hasPriceOrQuantityChange =
    request.priceValue !== undefined ||
    request.availableQuantity !== undefined ||
    request.priceCurrency !== undefined;

  if (!hasPriceOrQuantityChange) {
    return false;
  }

  return request.sku === undefined &&
    request.marketplaceId === undefined &&
    request.title === undefined &&
    request.description === undefined &&
    request.categoryId === undefined &&
    request.condition === undefined &&
    request.conditionDescription === undefined &&
    request.format === undefined &&
    request.policies === undefined &&
    request.locationKey === undefined &&
    request.images === undefined &&
    request.aspects === undefined &&
    request.packageWeightAndSize === undefined &&
    request.conditionDescriptors === undefined &&
    request.locale === undefined;
}

function fail(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}
