import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { APP_NAME, DEFAULT_PROFILE } from "./constants.js";
import { AppError } from "./errors.js";
import { type BackendProfile, type LocalEbaySession, type SelfManagedApp, backendProfileSchema } from "./backend-types.js";

interface ProfilesFile {
  profiles: BackendProfile[];
}

export type BootstrapIssue = "missing_app_credentials" | "missing_ebay_session";

export interface BootstrapGuidance {
  profile: string;
  issue: BootstrapIssue;
  mode: "self-managed" | "companion-backend-relay" | "unconfigured";
  configured: {
    backendBaseUrl: boolean;
    selfManagedApp: boolean;
    ebaySession: boolean;
  };
  nextCommands: string[];
  notes: string[];
  docs: string[];
}

export interface BackendAppPaths {
  configDir: string;
  profilesFile: string;
}

export function getBackendAppPaths(): BackendAppPaths {
  const baseDir = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, APP_NAME)
    : join(homedir(), ".config", APP_NAME);

  return {
    configDir: baseDir,
    profilesFile: join(baseDir, "backend-profiles.json")
  };
}

export function ensureBackendConfigDirectory(): BackendAppPaths {
  const paths = getBackendAppPaths();
  mkdirSync(paths.configDir, { recursive: true });
  return paths;
}

export function loadBackendProfiles(): BackendProfile[] {
  const paths = ensureBackendConfigDirectory();
  if (!existsSync(paths.profilesFile)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(paths.profilesFile, "utf8")) as ProfilesFile;
  return parsed.profiles.map((profile) => backendProfileSchema.parse(profile));
}

export function saveBackendProfiles(profiles: BackendProfile[]): void {
  const paths = ensureBackendConfigDirectory();
  writeFileSync(paths.profilesFile, `${JSON.stringify({ profiles }, null, 2)}\n`, "utf8");
}

export function getBackendProfile(name = DEFAULT_PROFILE): BackendProfile | undefined {
  return loadBackendProfiles().find((profile) => profile.name === name);
}

export function upsertBackendProfile(input: Partial<BackendProfile> & Pick<BackendProfile, "name">): BackendProfile {
  const profiles = loadBackendProfiles();
  const existing = profiles.find((profile) => profile.name === input.name);

  const merged = backendProfileSchema.parse({
    name: input.name,
    backendBaseUrl: input.backendBaseUrl ?? existing?.backendBaseUrl,
    selfManagedApp: input.selfManagedApp ?? existing?.selfManagedApp,
    ebaySession: input.ebaySession ?? existing?.ebaySession,
    outputFormat: input.outputFormat ?? existing?.outputFormat
  });

  const nextProfiles = existing
    ? profiles.map((profile) => (profile.name === merged.name ? merged : profile))
    : [...profiles, merged];

  saveBackendProfiles(nextProfiles);
  return merged;
}

export function resolveBackendProfile(name = DEFAULT_PROFILE): BackendProfile {
  return getBackendProfile(name) ?? upsertBackendProfile({ name });
}

export function requireConfiguredBackendProfile(name = DEFAULT_PROFILE): BackendProfile {
  const profile = resolveBackendProfile(name);
  if (!profile.selfManagedApp) {
    throw new AppError(
      "CONFIG_ERROR",
      `eBay app credentials are not configured for profile '${profile.name}'. Run \`ebay config auth --client-id ... --client-secret ... --runame ... --environment production\`, then \`ebay auth login --environment production\`.`,
      buildBootstrapGuidance(profile, "missing_app_credentials")
    );
  }

  return profile;
}

export function clearLocalEbaySession(name = DEFAULT_PROFILE): BackendProfile {
  const profiles = loadBackendProfiles();
  const existing = profiles.find((profile) => profile.name === name);
  const merged = backendProfileSchema.parse({
    name,
    backendBaseUrl: existing?.backendBaseUrl,
    selfManagedApp: existing?.selfManagedApp,
    outputFormat: existing?.outputFormat
  });

  const nextProfiles = existing
    ? profiles.map((profile) => (profile.name === name ? merged : profile))
    : [...profiles, merged];

  saveBackendProfiles(nextProfiles);
  return merged;
}

export function requireLocalEbaySession(profile: BackendProfile): LocalEbaySession {
  if (!profile.ebaySession) {
    throw new AppError(
      "AUTH_REQUIRED",
      `No eBay seller session is connected for profile '${profile.name}'. Run \`ebay auth login --environment ${profile.selfManagedApp?.environment ?? "production"}\` first.`,
      buildBootstrapGuidance(profile, "missing_ebay_session")
    );
  }

  return profile.ebaySession;
}

export function requireSelfManagedApp(profile: BackendProfile): SelfManagedApp {
  if (!profile.selfManagedApp) {
    throw new AppError(
      "CONFIG_ERROR",
      `This profile does not have eBay app credentials configured. Run \`ebay config auth --client-id ... --client-secret ... --runame ... --environment production\`.`,
      buildBootstrapGuidance(profile, "missing_app_credentials")
    );
  }

  return profile.selfManagedApp;
}

export function buildBootstrapGuidance(profile: BackendProfile, issue: BootstrapIssue): BootstrapGuidance {
  const environment = profile.selfManagedApp?.environment ?? "production";
  const configured = {
    backendBaseUrl: Boolean(profile.backendBaseUrl),
    selfManagedApp: Boolean(profile.selfManagedApp),
    ebaySession: Boolean(profile.ebaySession)
  };

  const nextCommands =
    issue === "missing_app_credentials"
      ? [
          "ebay config auth --client-id <ebay-client-id> --client-secret <ebay-client-secret> --runame <ebay-runame> --environment production",
          "ebay auth login --environment production",
          "ebay status --json"
        ]
      : [
          `ebay auth login --environment ${environment}`,
          "ebay status --json"
        ];

  const notes = [
    "The CLI is self-managed: each user supplies their own eBay developer app credentials.",
    "The optional backend is only a companion relay/site for OAuth callback, privacy, and health surfaces; it is not a shared public auth mode."
  ];

  if (!profile.backendBaseUrl) {
    notes.push("If using the reference backend for OAuth callback relay, set it first with `ebay config set --backend-url https://your-backend.example.com`.");
  }

  return {
    profile: profile.name,
    issue,
    mode: profile.backendBaseUrl ? "companion-backend-relay" : profile.selfManagedApp ? "self-managed" : "unconfigured",
    configured,
    nextCommands,
    notes,
    docs: [
      "README.md",
      "cli/README.md",
      "docs/agent-first-architecture.md",
      "docs/bootstrap-profile-spec.md"
    ]
  };
}
