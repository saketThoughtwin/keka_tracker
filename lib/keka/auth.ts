import axios from "axios";
import type { KekaConfig } from "./config";
import {
  decodeJwtExpiry,
  loadTokens,
  saveTokens,
  type TokenPair,
} from "./tokens";

let cached: TokenPair | null = null;
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;
let lastConfigAccessToken = "";

function getCached(config: KekaConfig): TokenPair {
  // If access token changed (updated in .env.local), reload from file
  // This allows users to manually update tokens without restarting
  if (lastConfigAccessToken !== config.accessToken) {
    cached = null;
    lastConfigAccessToken = config.accessToken;
  }

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
  
  const timeUntilExpiry = expiresAt - Date.now();
  
  // For short-lived tokens (< 10 minutes), refresh at 50% remaining time
  // This handles 5-minute tokens by refreshing every ~2.5 minutes
  if (timeUntilExpiry < 10 * 60 * 1000) {
    return timeUntilExpiry < timeUntilExpiry * 0.5; // Refresh at 50% threshold
  }
  
  // For longer-lived tokens, refresh 5 minutes before expiry
  return timeUntilExpiry < 5 * 60 * 1000;
}

async function refreshToken(config: KekaConfig): Promise<string> {
  const tokens = getCached(config);

  // Try automatic refresh with client credentials if available
  if (config.clientId && config.clientSecret) {
    return refreshTokenWithClientCredentials(config, tokens);
  }

  // If no client credentials, try using the token endpoint directly with refresh_token
  // This works for Keka's OAuth2 implementation
  return refreshTokenWithRefreshToken(config, tokens);
}

async function refreshTokenWithClientCredentials(
  config: KekaConfig,
  tokens: TokenPair
): Promise<string> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", tokens.refreshToken);
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);

  try {
    const { data } = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>(config.tokenUrl, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
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
  } catch (error) {
    cached = null;
    throw new Error(
      `Token refresh with client credentials failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function refreshTokenWithRefreshToken(
  config: KekaConfig,
  tokens: TokenPair
): Promise<string> {
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", tokens.refreshToken);

    const { data } = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>(config.tokenUrl, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
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
  } catch (error) {
    cached = null;
    throw new Error(
      `Token refresh failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function getValidAccessToken(
  config: KekaConfig,
  forceRefresh = false
): Promise<string> {
  const tokens = getCached(config);

  // If not forcing refresh and token is still valid, return it
  if (!forceRefresh && !isExpiringSoon(tokens.expiresAt)) {
    return tokens.accessToken;
  }

  // If already refreshing, wait for the existing refresh to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  // If we don't have a refresh token, we can't refresh
  if (!tokens.refreshToken) {
    if (forceRefresh) {
      throw new Error(
        "Cannot refresh token: No refresh token found.\n\n" +
        "Make sure KEKA_REFRESH_TOKEN is set in .env.local"
      );
    }
    return tokens.accessToken;
  }

  // Start refresh (we have refresh token)
  isRefreshing = true;
  refreshPromise = refreshToken(config)
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function forceRefreshToken(config: KekaConfig): Promise<string> {
  cached = null; // Clear cache to force refresh
  return getValidAccessToken(config, true);
}
