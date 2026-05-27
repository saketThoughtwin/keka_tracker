import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const TOKEN_FILE = join(process.cwd(), ".keka-tokens.json");

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export function loadTokens(
  fallback: TokenPair,
): TokenPair {
  if (!existsSync(TOKEN_FILE)) return fallback;
  try {
    const raw = JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as TokenPair;
    return {
      accessToken: raw.accessToken || fallback.accessToken,
      refreshToken: raw.refreshToken || fallback.refreshToken,
      expiresAt: raw.expiresAt,
    };
  } catch {
    return fallback;
  }
}

export function saveTokens(tokens: TokenPair): void {
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

export function decodeJwtExpiry(accessToken: string): number | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { exp?: number };
    return json.exp ? json.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
