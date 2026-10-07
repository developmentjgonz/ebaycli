import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";

import YAML from "yaml";

import { AppError } from "./errors.js";
import type { ListingPatchRequest, ListingSpecRequest } from "./types.js";

type JsonObject = Record<string, unknown>;

export function parseDataFile<T>(filePath: string): T {
  const fullPath = resolve(filePath);
  const source = readFileSync(fullPath, "utf8");
  const extension = extname(fullPath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return YAML.parse(source) as T;
  }

  return JSON.parse(source) as T;
}

export function writeDataFile(filePath: string, data: unknown): void {
  const fullPath = resolve(filePath);
  const extension = extname(fullPath).toLowerCase();
  const content =
    extension === ".yaml" || extension === ".yml"
      ? YAML.stringify(data)
      : `${JSON.stringify(data, null, 2)}\n`;

  writeFileSync(fullPath, content, "utf8");
}

export async function parseListingSpecFile(filePath: string): Promise<ListingSpecRequest> {
  return await normalizeListingSpec(parseDataFile<JsonObject>(filePath), dirname(resolve(filePath)));
}

export async function parseListingPatchFile(filePath: string): Promise<ListingPatchRequest> {
  return await normalizeListingPatch(parseDataFile<JsonObject>(filePath), dirname(resolve(filePath)));
}

async function normalizeListingSpec(raw: JsonObject, baseDir: string): Promise<ListingSpecRequest> {
  return {
    sku: asString(raw.sku, "sku"),
    writePath: normalizeWritePath(raw.writePath),
    marketplaceId: optionalString(raw.marketplaceId),
    title: asString(raw.title, "title"),
    description: asString(raw.description, "description"),
    categoryId: asString(raw.categoryId, "categoryId"),
    condition: asString(raw.condition, "condition"),
    conditionDescription: optionalString(raw.conditionDescription),
    format: optionalString(raw.format),
    priceValue: readPriceValue(raw),
    priceCurrency: readPriceCurrency(raw),
    availableQuantity: asNumber(raw.availableQuantity, "availableQuantity"),
    policies: normalizePolicies(raw.policies),
    locationKey: optionalString(raw.locationKey),
    location: optionalString(raw.location),
    postalCode: optionalString(raw.postalCode),
    country: optionalString(raw.country),
    dispatchTimeMax: optionalNumber(raw.dispatchTimeMax),
    bestOfferEnabled: optionalBoolean(raw.bestOfferEnabled),
    minimumBestOfferPrice: optionalNumber(raw.minimumBestOfferPrice),
    autoAcceptPrice: optionalNumber(raw.autoAcceptPrice),
    images: await normalizeImages(raw.images, baseDir),
    aspects: normalizeAspects(raw.aspects),
    packageWeightAndSize: raw.packageWeightAndSize,
    conditionDescriptors: normalizeConditionDescriptors(raw.conditionDescriptors),
    locale: optionalString(raw.locale)
  };
}

async function normalizeListingPatch(raw: JsonObject, baseDir: string): Promise<ListingPatchRequest> {
  const request: ListingPatchRequest = {};
  if ("sku" in raw) request.sku = optionalString(raw.sku);
  if ("writePath" in raw) request.writePath = normalizeWritePath(raw.writePath);
  if ("marketplaceId" in raw) request.marketplaceId = optionalString(raw.marketplaceId);
  if ("title" in raw) request.title = optionalString(raw.title);
  if ("description" in raw) request.description = optionalString(raw.description);
  if ("categoryId" in raw) request.categoryId = optionalString(raw.categoryId);
  if ("condition" in raw) request.condition = optionalString(raw.condition);
  if ("conditionDescription" in raw) request.conditionDescription = optionalString(raw.conditionDescription);
  if ("format" in raw) request.format = optionalString(raw.format);
  if ("priceValue" in raw || "price" in raw) request.priceValue = readPriceValue(raw);
  if ("priceCurrency" in raw || "price" in raw) request.priceCurrency = readPriceCurrency(raw);
  if ("availableQuantity" in raw) request.availableQuantity = asNumber(raw.availableQuantity, "availableQuantity");
  if ("policies" in raw) request.policies = normalizePolicies(raw.policies);
  if ("locationKey" in raw) request.locationKey = optionalString(raw.locationKey);
  if ("location" in raw) request.location = optionalString(raw.location);
  if ("postalCode" in raw) request.postalCode = optionalString(raw.postalCode);
  if ("country" in raw) request.country = optionalString(raw.country);
  if ("dispatchTimeMax" in raw) request.dispatchTimeMax = optionalNumber(raw.dispatchTimeMax);
  if ("bestOfferEnabled" in raw) request.bestOfferEnabled = optionalBoolean(raw.bestOfferEnabled);
  if ("minimumBestOfferPrice" in raw) request.minimumBestOfferPrice = optionalNumber(raw.minimumBestOfferPrice);
  if ("autoAcceptPrice" in raw) request.autoAcceptPrice = optionalNumber(raw.autoAcceptPrice);
  if ("images" in raw) request.images = await normalizeImages(raw.images, baseDir);
  if ("aspects" in raw) request.aspects = normalizeAspects(raw.aspects);
  if ("packageWeightAndSize" in raw) request.packageWeightAndSize = raw.packageWeightAndSize;
  if ("conditionDescriptors" in raw) request.conditionDescriptors = normalizeConditionDescriptors(raw.conditionDescriptors);
  if ("locale" in raw) request.locale = optionalString(raw.locale);
  return request;
}

async function normalizeImages(value: unknown, baseDir: string) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "`images` must be an array.");
  }

  const images = [];
  for (const item of value) {
    images.push(await normalizeImage(item, baseDir));
  }
  return images;
}

async function normalizeImage(value: unknown, baseDir: string) {
  if (typeof value === "string") {
    return normalizeImageString(value, baseDir);
  }

  if (!isRecord(value)) {
    throw new AppError("VALIDATION_ERROR", "Each image must be a string or object.");
  }

  if (typeof value.url === "string" && value.url.length > 0) {
    return { url: value.url };
  }

  if (typeof value.path === "string" && value.path.length > 0) {
    return normalizeImageString(value.path, baseDir);
  }

  if (typeof value.base64Content === "string" && value.base64Content.length > 0) {
    return {
      fileName: typeof value.fileName === "string" ? value.fileName : "image.bin",
      contentType: typeof value.contentType === "string" ? value.contentType : "application/octet-stream",
      base64Content: value.base64Content
    };
  }

  throw new AppError("VALIDATION_ERROR", "Each image object must include `url`, `path`, or `base64Content`.");
}

function normalizeImageString(value: string, baseDir: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { url: value };
  }

  const fullPath = resolve(baseDir, value);
  const buffer = readFileSync(fullPath);
  return {
    fileName: basename(fullPath),
    contentType: guessContentType(fullPath),
    base64Content: buffer.toString("base64")
  };
}

function normalizePolicies(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...(typeof value.paymentPolicyId === "string" ? { paymentPolicyId: value.paymentPolicyId } : {}),
    ...(typeof value.returnPolicyId === "string" ? { returnPolicyId: value.returnPolicyId } : {}),
    ...(typeof value.fulfillmentPolicyId === "string" ? { fulfillmentPolicyId: value.fulfillmentPolicyId } : {})
  };
}

function normalizeAspects(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const aspects: Record<string, string[]> = {};
  for (const [key, rawValues] of Object.entries(value)) {
    if (!Array.isArray(rawValues)) {
      continue;
    }

    aspects[key] = rawValues.filter((entry): entry is string => typeof entry === "string");
  }
  return aspects;
}

function normalizeConditionDescriptors(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "`conditionDescriptors` must be an array.");
  }

  return value.map((descriptor, index) => {
    if (!isRecord(descriptor)) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}] must be an object.`);
    }

    if (typeof descriptor.name !== "string" || descriptor.name.length === 0) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].name is required.`);
    }

    if (!Array.isArray(descriptor.values) || descriptor.values.length === 0) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].values must be a non-empty array.`);
    }

    const values = descriptor.values.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (values.length !== descriptor.values.length) {
      throw new AppError("VALIDATION_ERROR", `conditionDescriptors[${index}].values must contain only non-empty strings.`);
    }

    return {
      name: descriptor.name,
      values
    };
  });
}

function normalizeWritePath(value: unknown): "INVENTORY" | "TRADING" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "INVENTORY" || normalized === "TRADING") {
    return normalized;
  }

  throw new AppError("VALIDATION_ERROR", "`writePath` must be either INVENTORY or TRADING.");
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new AppError("VALIDATION_ERROR", "Expected a numeric value.");
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw new AppError("VALIDATION_ERROR", "Expected a boolean value.");
}

function readPriceValue(raw: JsonObject): number {
  if (typeof raw.priceValue === "number") {
    return raw.priceValue;
  }

  if (typeof raw.priceValue === "string") {
    return Number(raw.priceValue);
  }

  if (isRecord(raw.price) && (typeof raw.price.value === "number" || typeof raw.price.value === "string")) {
    return Number(raw.price.value);
  }

  throw new AppError("VALIDATION_ERROR", "Listing price is required.");
}

function readPriceCurrency(raw: JsonObject): string | undefined {
  if (typeof raw.priceCurrency === "string") {
    return raw.priceCurrency;
  }

  if (isRecord(raw.price) && typeof raw.price.currency === "string") {
    return raw.price.currency;
  }

  return undefined;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("VALIDATION_ERROR", `\`${field}\` is required.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  throw new AppError("VALIDATION_ERROR", `\`${field}\` must be numeric.`);
}

function guessContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
