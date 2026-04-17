import type {
  DoctorReportResponse,
  EbayConnectionResponse,
  ListingSummary,
  MutationPlanResponse
} from "./backend-types.js";

function printObject(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function renderResult(value: unknown, asJson: boolean): void {
  if (asJson) {
    printObject(value);
    return;
  }

  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }

  printObject(value);
}

export function renderMutationPlan(plan: MutationPlanResponse, asJson: boolean): void {
  if (asJson) {
    printObject(plan);
    return;
  }

  process.stdout.write(`Mode: ${plan.mode}\n`);
  process.stdout.write(`Context: ${plan.storeOwnerSlug} (${plan.environment})\n`);
  process.stdout.write(`Marketplace: ${plan.marketplaceId}\n`);
  for (const action of plan.actions) {
    process.stdout.write(`- ${action.type}: ${action.description}\n`);
  }
  if (plan.warnings.length > 0) {
    process.stdout.write("Warnings:\n");
    for (const warning of plan.warnings) {
      process.stdout.write(`- ${warning}\n`);
    }
  }
}

export function renderDoctorReport(report: DoctorReportResponse, asJson: boolean): void {
  if (asJson) {
    printObject(report);
    return;
  }

  process.stdout.write(`Doctor report for ${report.storeOwnerSlug} (${report.environment})\n`);
  for (const check of report.checks) {
    process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.message}\n`);
  }
}

export function renderConnectionStatus(status: EbayConnectionResponse, asJson: boolean): void {
  if (asJson) {
    printObject(status);
    return;
  }

  if (!status.connected) {
    process.stdout.write("No local eBay session is connected.\n");
    return;
  }

  process.stdout.write(`Context: ${status.storeOwnerSlug}\n`);
  process.stdout.write("Connected: yes\n");
  process.stdout.write(`Environment: ${status.environment ?? "-"}\n`);
  process.stdout.write(`Marketplace: ${status.marketplaceId ?? "-"}\n`);
  process.stdout.write(`eBay user: ${status.ebayUsername ?? status.ebayUserId ?? "-"}\n`);
  process.stdout.write(`Seller registration: ${status.sellerRegistrationCompleted === true ? "complete" : "incomplete"}\n`);
}

export function renderListings(listings: ListingSummary[], asJson: boolean): void {
  if (asJson) {
    printObject(listings);
    return;
  }

  if (listings.length === 0) {
    process.stdout.write("No listings found.\n");
    return;
  }

  for (const listing of listings) {
    const details = [
      `${listing.sku}`,
      `offer=${String(listing.offerId ?? "-")}`,
      `listing=${String(listing.listingId ?? "-")}`,
      `status=${String(listing.status ?? "-")}`,
      `title=${String(listing.title ?? "-")}`
    ];
    if (listing.priceValue !== null && listing.priceValue !== undefined) {
      details.push(`price=${listing.priceValue}${listing.priceCurrency ? ` ${listing.priceCurrency}` : ""}`);
    }
    if (listing.availableQuantity !== null && listing.availableQuantity !== undefined) {
      details.push(`qty=${listing.availableQuantity}`);
    }
    if (listing.quantitySold !== null && listing.quantitySold !== undefined) {
      details.push(`qtySold=${listing.quantitySold}`);
    }
    if (listing.soldAtUtc) {
      details.push(`soldAt=${listing.soldAtUtc}`);
    }
    if (listing.buyerUsername) {
      details.push(`buyer=${listing.buyerUsername}`);
    }
    if (listing.source) {
      details.push(`source=${listing.source}`);
    }
    process.stdout.write(`${details.join("  ")}\n`);
  }
}
