import { describe, expect, it } from "vitest";

import { decryptText, encryptText, hashHex, importTokenKey } from "../src/crypto.js";
import { TOKEN_KEY } from "./fixtures.js";

describe("transient token encryption", () => {
  it("round trips using the deployment key and a fresh IV for each encryption", async () => {
    const key = await importTokenKey(TOKEN_KEY);
    const plaintext = JSON.stringify({ accessToken: "access-secret", refreshToken: "refresh-secret" });
    const first = await encryptText(plaintext, key);
    const second = await encryptText(plaintext, key);

    expect(first).not.toBe(second);
    expect(first).not.toContain("access-secret");
    expect(first).not.toContain("refresh-secret");
    expect(await decryptText(first, key)).toBe(plaintext);
    expect(await decryptText(second, key)).toBe(plaintext);
  });

  it("rejects a different deployment key or modified ciphertext", async () => {
    const key = await importTokenKey(TOKEN_KEY);
    const wrongKey = await importTokenKey(Buffer.alloc(32, 8).toString("base64"));
    const encrypted = await encryptText("private session", key);
    await expect(decryptText(encrypted, wrongKey)).rejects.toThrow();

    const [version, iv, ciphertext] = encrypted.split(".");
    const bytes = Buffer.from(ciphertext!, "base64");
    bytes[0] = bytes[0]! ^ 1;
    await expect(decryptText(`${version}.${iv}.${bytes.toString("base64")}`, key)).rejects.toThrow();
  });

  it("binds encrypted sessions to their OAuth state", async () => {
    const key = await importTokenKey(TOKEN_KEY);
    const encrypted = await encryptText("private session", key, "state-a");
    expect(await decryptText(encrypted, key, "state-a")).toBe("private session");
    await expect(decryptText(encrypted, key, "state-b")).rejects.toThrow();
  });

  it.each([undefined, "", "not-base64!", Buffer.alloc(16).toString("base64")])("rejects a missing or invalid token key: %s", async (value) => {
    await expect(importTokenKey(value)).rejects.toThrow();
  });

  it("rejects malformed ciphertext and unsupported format versions", async () => {
    const key = await importTokenKey(TOKEN_KEY);
    await expect(decryptText("invalid", key)).rejects.toThrow();
    await expect(decryptText("v99.aGVsbG8=.d29ybGQ=", key)).rejects.toThrow();
  });

  it("uses the expected SHA-256 digest for challenge and exchange-code hashing", async () => {
    expect(await hashHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
