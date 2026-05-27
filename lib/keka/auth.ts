import axios from "axios";
import type { KekaConfig } from "./config";
import {
  decodeJwtExpiry,
  loadTokens,
  saveTokens,
  type TokenPair,
} from "./tokens";

let cached: TokenPair | null = null;

function getCached(config: KekaConfig): TokenPair {
  if (!cached) {
    cached = loadTokens({
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: decodeJwtExpiry(config.accessToken),
    });
  }
  return cached;
}

function isExpiringSoon(expiresAt?: number): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - 5 * 60 * 1000;
}

export async function getValidAccessToken(config: KekaConfig): Promise<string> {
  const tokens = getCached(config);
  if (!isExpiringSoon(tokens.expiresAt)) {
    return tokens.accessToken;
  }

  // If we don't have client credentials, we can still try the API call with the
  // existing access token (initial setup). If it later expires, you will need
  // to add KEKA_CLIENT_ID/KEKA_CLIENT_SECRET to allow refresh.
  if (!config.clientId || !config.clientSecret) {
    return tokens.accessToken;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", tokens.refreshToken);
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);

  const { data } = await axios.post<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>(config.tokenUrl, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const expiresAt =
    data.expires_in != null
      ? Date.now() + data.expires_in * 1000
      : decodeJwtExpiry(data.access_token);

  cached = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt,
  };
  saveTokens(cached);
  return cached.accessToken;
}
