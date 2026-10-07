import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { APP_NAME, DEFAULT_PROFILE } from "./constants.js";
import { AppError } from "./errors.js";
import { type CliProfile, type LocalEbaySession, cliProfileSchema } from "./types.js";

interface ProfilesFile {
  profiles: CliProfile[];
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

export interface AppPaths {
  configDir: string;
  profilesFile: string;
}

export function getAppPaths(): AppPaths {
  const baseDir = process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, APP_NAME)
    : join(homedir(), ".config", APP_NAME);

  return {
    configDir: baseDir,
    // Keep the existing filename so upgrades reuse saved profiles and sessions.
    profilesFile: join(baseDir, "backend-profiles.json")
  };
}

export function ensureConfigDirectory(): AppPaths {
  const paths = getAppPaths();
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(paths.configDir, 0o700);
  return paths;
}

export function loadProfiles(): CliProfile[] {
  const paths = ensureConfigDirectory();
  if (!existsSync(paths.profilesFile)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(paths.profilesFile, "utf8")) as ProfilesFile;
  return parsed.profiles.map((profile) => cliProfileSchema.parse(profile));
}

export function saveProfiles(profiles: CliProfile[]): void {
  const paths = ensureConfigDirectory();
  writeFileSync(paths.profilesFile, `${JSON.stringify({ profiles }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(paths.profilesFile, 0o600);
}

export function getProfile(name = DEFAULT_PROFILE): CliProfile | undefined {
  return loadProfiles().find((profile) => profile.name === name);
}

export function upsertProfile(input: Partial<CliProfile> & Pick<CliProfile, "name">): CliProfile {
  const profiles = loadProfiles();
  const existing = profiles.find((profile) => profile.name === input.name);

  const merged = cliProfileSchema.parse({
    name: input.name,
    backendBaseUrl: input.backendBaseUrl ?? existing?.backendBaseUrl,
    ebaySession: input.ebaySession ?? existing?.ebaySession,
    outputFormat: input.outputFormat ?? existing?.outputFormat
  });

  const nextProfiles = existing
    ? profiles.map((profile) => (profile.name === merged.name ? merged : profile))
    : [...profiles, merged];

  saveProfiles(nextProfiles);
  return merged;
}

export function resolveProfile(name = DEFAULT_PROFILE): CliProfile {
  return getProfile(name) ?? upsertProfile({ name });
}

export function requireConfiguredProfile(name = DEFAULT_PROFILE): CliProfile {
  const profile = resolveProfile(name);
  if (!profile.backendBaseUrl) {
    throw new AppError(
      "CONFIG_ERROR",
      `No backend relay URL is configured for profile '${profile.name}'. Run \`ebay config set --backend-url https://your-backend.example.com --json\`, then \`ebay auth login --environment production --json\`.`,
      buildBootstrapGuidance(profile, "missing_backend_url")
    );
  }

  return profile;
}

export function clearLocalEbaySession(name = DEFAULT_PROFILE): CliProfile {
  const profiles = loadProfiles();
  const existing = profiles.find((profile) => profile.name === name);
  const merged = cliProfileSchema.parse({
    name,
    backendBaseUrl: existing?.backendBaseUrl,
    outputFormat: existing?.outputFormat
  });

  const nextProfiles = existing
    ? profiles.map((profile) => (profile.name === name ? merged : profile))
    : [...profiles, merged];

  saveProfiles(nextProfiles);
  return merged;
}

export function requireLocalEbaySession(profile: CliProfile): LocalEbaySession {
  if (!profile.ebaySession) {
    throw new AppError(
      "AUTH_REQUIRED",
      `No eBay seller session is connected for profile '${profile.name}'. Run \`ebay auth login --environment production --json\` first.`,
      buildBootstrapGuidance(profile, "missing_ebay_session")
    );
  }

  return profile.ebaySession;
}

export function buildBootstrapGuidance(profile: CliProfile, issue: BootstrapIssue): BootstrapGuidance {
  const environment = profile.ebaySession?.environment ?? "production";
  const configured = {
    backendBaseUrl: Boolean(profile.backendBaseUrl),
    ebaySession: Boolean(profile.ebaySession)
  };

  const nextCommands = buildNextCommands(issue, environment);

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
      "https://github.com/developmentjgonz/ebaycli/blob/main/README.md",
      "https://github.com/developmentjgonz/ebaycli/blob/main/cli/README.md",
      "https://github.com/developmentjgonz/ebaycli/blob/main/docs/agent-first-architecture.md",
      "https://github.com/developmentjgonz/ebaycli/blob/main/docs/profiles.md"
    ]
  };
}

function buildNextCommands(issue: BootstrapIssue, environment: string): string[] {
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
