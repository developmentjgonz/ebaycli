import { clearLocalEbaySession, getProfile, requireLocalEbaySession, upsertProfile } from "./profile-config.js";
import { EbayApiClient, resolveEbayEnvironment } from "./ebay-api.js";
import {
  createListingDirect,
  endListingDirect,
  getConnectionStatusDirect,
  getListingDirect,
  listListingsDirect,
  optInPolicyProgramDirect,
  planCreateDirect,
  planEndDirect,
  planUpdateDirect,
  pullListingDirect,
  runDoctorDirect,
  syncPoliciesDirect,
  updateListingDirect,
  upsertLocationDirect,
  verifyCreateDirect
} from "./ebay-engine.js";
import { AppError } from "./errors.js";
import { parseDataFile, writeDataFile } from "./listing-files.js";
import { reconnectCommands, refreshLocalEbaySession } from "./oauth.js";
import type {
  CliProfile,
  DoctorReportResponse,
  EbayConnectionResponse,
  ListingPatchRequest,
  ListingSpecRequest,
  ListingSummary,
  LocalEbaySession,
  MutationPlanResponse
} from "./types.js";

async function ensureFreshLocalEbaySession(profile: CliProfile): Promise<LocalEbaySession> {
  const latestPersistedProfile = getProfile(profile.name);
  const session = requireLocalEbaySession(latestPersistedProfile ?? profile);
  const expiresAt = Date.parse(session.accessTokenExpiresAtUtc);
  if (Number.isNaN(expiresAt) || expiresAt > Date.now() + 60_000) {
    return session;
  }

  try {
    const refreshed = await refreshLocalEbaySession(profile, session);
    upsertProfile({ name: profile.name, ebaySession: refreshed });
    return refreshed;
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REVOKED") {
      clearLocalEbaySession(profile.name);
    }
    throw error;
  }
}

async function withFreshLocalEbaySession<T>(
  profile: CliProfile,
  action: (session: LocalEbaySession) => Promise<T>
): Promise<T> {
  const session = await ensureFreshLocalEbaySession(profile);
  try {
    return await action(session);
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REVOKED") {
      clearLocalEbaySession(profile.name);
      const nextCommands = reconnectCommands(profile, session);
      throw new AppError(
        error.code,
        `${error.message} Run \`${nextCommands[0]}\` to reconnect.`,
        { ...(error.details as Record<string, unknown>), nextCommands },
        error.exitCode
      );
    }
    throw error;
  }
}

export async function getLocalConnectionStatus(profile: CliProfile): Promise<EbayConnectionResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await getConnectionStatusDirect(createExecutionClient(session), session)
  );
}

export async function runLocalDoctor(profile: CliProfile): Promise<DoctorReportResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await runDoctorDirect(createExecutionClient(session), session)
  );
}

export async function syncLocalPolicies(
  profile: CliProfile,
  options: {
    paymentPolicyId?: string;
    returnPolicyId?: string;
    fulfillmentPolicyId?: string;
    createFromFile?: string;
  }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const direct = await syncPoliciesDirect(createExecutionClient(session), session, {
      paymentPolicyId: options.paymentPolicyId,
      returnPolicyId: options.returnPolicyId,
      fulfillmentPolicyId: options.fulfillmentPolicyId,
      createPayload: options.createFromFile ? parseDataFile<unknown>(options.createFromFile) : undefined
    });
    const updatedSession = direct.session;
    upsertProfile({ name: profile.name, ebaySession: updatedSession });
    return { result: direct.result, session: updatedSession };
  });
}

export async function optInLocalPolicyProgram(
  profile: CliProfile,
  programType = "SELLING_POLICY_MANAGEMENT"
): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await optInPolicyProgramDirect(createExecutionClient(session), session, programType)
  );
}

export async function createOrSetLocalLocation(
  profile: CliProfile,
  options: { key?: string; file?: string }
): Promise<{ result: unknown; session: LocalEbaySession }> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const direct = await upsertLocationDirect(createExecutionClient(session), session, {
      key: options.key,
      payload: options.file ? parseDataFile<unknown>(options.file) : undefined
    });
    const updatedSession = direct.session;
    upsertProfile({ name: profile.name, ebaySession: updatedSession });
    return { result: direct.result, session: updatedSession };
  });
}

export async function listLocalListings(
  profile: CliProfile,
  options?: { status?: string; page?: number; limit?: number; days?: number }
): Promise<ListingSummary[]> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await listListingsDirect(createExecutionClient(session), session, options)
  );
}

export async function getLocalListing(profile: CliProfile, reference: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await getListingDirect(createExecutionClient(session), session, reference)
  );
}

export async function pullLocalListing(profile: CliProfile, reference: string, outputPath: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) => {
    const spec = await pullListingDirect(createExecutionClient(session), session, reference);
    writeDataFile(outputPath, spec);
    return spec;
  });
}

export async function createLocalListingPlan(profile: CliProfile, request: ListingSpecRequest): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) => planCreateDirect(session, request));
}

export async function createLocalListing(profile: CliProfile, request: ListingSpecRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await createListingDirect(createExecutionClient(session), session, request)
  );
}

export async function verifyLocalListingCreate(profile: CliProfile, request: ListingSpecRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await verifyCreateDirect(createExecutionClient(session), session, request)
  );
}

export async function updateLocalListingPlan(profile: CliProfile, reference: string, request: ListingPatchRequest): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await planUpdateDirect(createExecutionClient(session), session, reference, request)
  );
}

export async function updateLocalListing(profile: CliProfile, reference: string, request: ListingPatchRequest): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await updateListingDirect(createExecutionClient(session), session, reference, request)
  );
}

export async function endLocalListingPlan(profile: CliProfile, reference: string): Promise<MutationPlanResponse> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await planEndDirect(createExecutionClient(session), session, reference)
  );
}

export async function endLocalListing(profile: CliProfile, reference: string): Promise<unknown> {
  return await withFreshLocalEbaySession(profile, async (session) =>
    await endListingDirect(createExecutionClient(session), session, reference)
  );
}

function createExecutionClient(session: LocalEbaySession): EbayApiClient {
  return new EbayApiClient(resolveEbayEnvironment(session.environment));
}
