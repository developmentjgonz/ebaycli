import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { APP_NAME, DEFAULT_PROFILE } from "./constants.js";
import { AppError } from "./errors.js";
import { type BackendProfile, type LocalEbaySession, backendProfileSchema } from "./backend-types.js";

interface ProfilesFile {
  profiles: BackendProfile[];
}

export type BootstrapIssue = "missing_backend_url" | "missing_ebay_session";

export interface BootstrapGuidance {
  profile: string;
  issue: BootstrapIssue;
  mode: "backend-relay" | "unconfigured";
  configured: {
    backendBaseUrl: boolean;
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
  if (!profile.backendBaseUrl) {
    throw new AppError(
      "CONFIG_ERROR",
      `No backend relay URL is configured for profile '${profile.name}'. Run \`ebay config set --backend-url https://your-backend.example.com --json\`, then \`ebay auth login --environment production --json\`.`,
      buildBootstrapGuidance(profile, "missing_backend_url")
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
      `No eBay seller session is connected for profile '${profile.name}'. Run \`ebay auth login --environment production --json\` first.`,
      buildBootstrapGuidance(profile, "missing_ebay_session")
    );
  }

  return profile.ebaySession;
}

export function buildBootstrapGuidance(profile: BackendProfile, issue: BootstrapIssue): BootstrapGuidance {
  const environment = profile.ebaySession?.environment ?? "production";
  const configured = {
    backendBaseUrl: Boolean(profile.backendBaseUrl),
    ebaySession: Boolean(profile.ebaySession)
  };

  const nextCommands = buildNextCommands(profile, issue, environment);

  const notes = [
    "Production OAuth uses the backend relay because eBay requires a public HTTPS redirect URL.",
    "The backend owns the eBay app credentials for this deployment; the CLI stores the local seller session after login.",
    "The CLI does not support direct eBay app credential configuration."
  ];

  return {
    profile: profile.name,
    issue,
    mode: profile.backendBaseUrl ? "backend-relay" : "unconfigured",
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

function buildNextCommands(profile: BackendProfile, issue: BootstrapIssue, environment: string): string[] {
  if (issue === "missing_ebay_session") {
    return [
      `ebay auth login --environment ${environment} --json`,
      "ebay status --json"
    ];
  }

  return [
    "ebay config set --backend-url https://your-backend.example.com --json",
    "ebay auth login --environment production --json",
    "ebay status --json"
  ];
}
