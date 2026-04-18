import { z } from "zod";

import { DEFAULT_BACKEND_BASE_URL, DEFAULT_PROFILE } from "./constants.js";

export const localEbaySessionSchema = z.object({
  environment: z.string(),
  marketplaceId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAtUtc: z.string(),
  refreshTokenExpiresAtUtc: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  tokenType: z.string().nullable().optional(),
  ebayUserId: z.string().nullable().optional(),
  ebayUsername: z.string().nullable().optional(),
  accountType: z.string().nullable().optional(),
  sellerRegistrationCompleted: z.boolean().nullable().optional(),
  defaultPaymentPolicyId: z.string().nullable().optional(),
  defaultReturnPolicyId: z.string().nullable().optional(),
  defaultFulfillmentPolicyId: z.string().nullable().optional(),
  defaultLocationKey: z.string().nullable().optional()
});
export type LocalEbaySession = z.infer<typeof localEbaySessionSchema>;

export const backendProfileSchema = z.object({
  name: z.string().min(1).default(DEFAULT_PROFILE),
  backendBaseUrl: z.string().url().default(DEFAULT_BACKEND_BASE_URL),
  ebaySession: localEbaySessionSchema.optional(),
  outputFormat: z.enum(["text", "json"]).default("text")
});
export type BackendProfile = z.infer<typeof backendProfileSchema>;

export const localEbayAuthStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  state: z.string(),
  environment: z.string(),
  marketplaceId: z.string(),
  expiresAtUtc: z.string()
});
export type LocalEbayAuthStartResponse = z.infer<typeof localEbayAuthStartResponseSchema>;

export const doctorCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  message: z.string(),
  details: z.unknown().optional()
});
export const doctorReportSchema = z.object({
  storeOwnerSlug: z.string(),
  environment: z.string(),
  checks: z.array(doctorCheckSchema)
});
export type DoctorReportResponse = z.infer<typeof doctorReportSchema>;

export const ebayConnectionResponseSchema = z.object({
  storeOwnerSlug: z.string(),
  connected: z.boolean(),
  environment: z.string().nullable().optional(),
  marketplaceId: z.string().nullable().optional(),
  ebayUserId: z.string().nullable().optional(),
  ebayUsername: z.string().nullable().optional(),
  accountType: z.string().nullable().optional(),
  sellerRegistrationCompleted: z.boolean().nullable().optional(),
  accessTokenExpiresAtUtc: z.string().nullable().optional(),
  connectedAtUtc: z.string().nullable().optional(),
  lastTokenRefreshAtUtc: z.string().nullable().optional()
});
export type EbayConnectionResponse = z.infer<typeof ebayConnectionResponseSchema>;

export const listingPoliciesDtoSchema = z.object({
  paymentPolicyId: z.string().optional(),
  returnPolicyId: z.string().optional(),
  fulfillmentPolicyId: z.string().optional()
});
export type ListingPoliciesDto = z.infer<typeof listingPoliciesDtoSchema>;

export const listingImageDtoSchema = z.object({
  url: z.string().optional(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  base64Content: z.string().optional()
});
export type ListingImageDto = z.infer<typeof listingImageDtoSchema>;

export const listingConditionDescriptorDtoSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(1)
});
export type ListingConditionDescriptorDto = z.infer<typeof listingConditionDescriptorDtoSchema>;

export const listingSpecRequestSchema = z.object({
  sku: z.string().min(1),
  marketplaceId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  condition: z.string().min(1),
  conditionDescription: z.string().optional(),
  format: z.string().optional(),
  priceValue: z.number().nonnegative(),
  priceCurrency: z.string().optional(),
  availableQuantity: z.number().int().nonnegative(),
  policies: listingPoliciesDtoSchema.optional(),
  locationKey: z.string().optional(),
  images: z.array(listingImageDtoSchema).optional(),
  aspects: z.record(z.string(), z.array(z.string())).optional(),
  packageWeightAndSize: z.unknown().optional(),
  conditionDescriptors: z.array(listingConditionDescriptorDtoSchema).optional(),
  locale: z.string().optional()
});
export type ListingSpecRequest = z.infer<typeof listingSpecRequestSchema>;

export const listingPatchRequestSchema = listingSpecRequestSchema.partial();
export type ListingPatchRequest = z.infer<typeof listingPatchRequestSchema>;

export const listingSummarySchema = z.object({
  sku: z.string(),
  marketplaceId: z.string(),
  offerId: z.string().nullable().optional(),
  listingId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  priceValue: z.number().nullable().optional(),
  priceCurrency: z.string().nullable().optional(),
  availableQuantity: z.number().nullable().optional(),
  quantitySold: z.number().nullable().optional(),
  soldAtUtc: z.string().nullable().optional(),
  buyerUsername: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  listingUrl: z.string().nullable().optional()
});
export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const listingAggregateResponseSchema = z.object({
  aggregate: z.unknown(),
  spec: z.unknown()
});
export type ListingAggregateResponse = z.infer<typeof listingAggregateResponseSchema>;

export const mutationActionSchema = z.object({
  type: z.string(),
  description: z.string(),
  payload: z.unknown().optional()
});
export const mutationPlanSchema = z.object({
  mode: z.string(),
  environment: z.string(),
  storeOwnerSlug: z.string(),
  marketplaceId: z.string(),
  target: z.unknown(),
  actions: z.array(mutationActionSchema),
  warnings: z.array(z.string())
});
export type MutationPlanResponse = z.infer<typeof mutationPlanSchema>;
