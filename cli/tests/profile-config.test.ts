import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppPaths, getProfile, requireConfiguredProfile, requireLocalEbaySession, upsertProfile } from "../src/profile-config.js";
import { AppError } from "../src/errors.js";

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
  vi.unstubAllGlobals();
});

function useIsolatedConfigHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebaycli-config-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

describe("bootstrap guidance", () => {
  it.skipIf(process.platform === "win32")("restricts saved profiles and existing profile files to their owner on POSIX", () => {
    const dir = useIsolatedConfigHome();
    try {
      upsertProfile({ name: "existing", backendBaseUrl: "https://relay.example.test" });
      const paths = getAppPaths();
      expect(statSync(paths.configDir).mode & 0o777).toBe(0o700);
      expect(statSync(paths.profilesFile).mode & 0o777).toBe(0o600);
      chmodSync(paths.configDir, 0o755);
      chmodSync(paths.profilesFile, 0o644);

      upsertProfile({ name: "another", backendBaseUrl: "https://relay.example.test" });
      expect(statSync(paths.configDir).mode & 0o777).toBe(0o700);
      expect(statSync(paths.profilesFile).mode & 0o777).toBe(0o600);
      expect(getProfile("existing")?.backendBaseUrl).toBe("https://relay.example.test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("explains the production bootstrap path from an empty profile", () => {
    const dir = useIsolatedConfigHome();

    try {
      let thrown: unknown;
      try {
        requireConfiguredProfile();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      const error = thrown as AppError;
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error.message).toContain("profile 'default'");
      expect(error.details).toEqual(
        expect.objectContaining({
          profile: "default",
          issue: "missing_backend_url",
          mode: "unconfigured",
          configured: {
            backendBaseUrl: false,
            ebaySession: false
          },
          nextCommands: [
            "ebay config set --backend-url https://your-backend.example.com --json",
            "ebay auth login --environment production --json",
            "ebay status --json"
          ],
          docs: expect.arrayContaining([
            "https://github.com/developmentjgonz/ebaycli/blob/main/README.md",
            "https://github.com/developmentjgonz/ebaycli/blob/main/cli/README.md"
          ])
        })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a backend relay URL as sufficient production auth configuration", () => {
    const dir = useIsolatedConfigHome();
    upsertProfile({
      name: "default",
      backendBaseUrl: "https://backend.example.test"
    });

    try {
      const profile = requireConfiguredProfile();
      expect(profile.backendBaseUrl).toBe("https://backend.example.test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("guides configured profiles to login when no eBay seller session exists", () => {
    const dir = useIsolatedConfigHome();
    const profile = upsertProfile({
      name: "configured",
      backendBaseUrl: "https://backend.example.test"
    });

    try {
      let thrown: unknown;
      try {
        requireLocalEbaySession(profile);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      const error = thrown as AppError;
      expect(error.code).toBe("AUTH_REQUIRED");
      expect(error.details).toEqual(
        expect.objectContaining({
          profile: "configured",
          issue: "missing_ebay_session",
          mode: "backend-relay",
          configured: {
            backendBaseUrl: true,
            ebaySession: false
          },
          nextCommands: [
            "ebay auth login --environment production --json",
            "ebay status --json"
          ]
        })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
