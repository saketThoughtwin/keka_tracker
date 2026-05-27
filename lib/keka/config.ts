function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getKekaConfig() {
  const baseUrl = required("KEKA_BASE_URL").replace(/\/$/, "");
  const summaryPath =
    optional("KEKA_SUMMARY_PATH") ?? "/k/attendance/api/mytime/attendance/summary";

  const targetMinutesEnv = optional("KEKA_TARGET_MINUTES");
  const targetHoursEnv = optional("KEKA_TARGET_HOURS");
  const targetMinutesIsExplicit = Boolean(targetMinutesEnv || targetHoursEnv);
  const targetMinutes = targetMinutesEnv
    ? Number(targetMinutesEnv)
    : targetHoursEnv
      ? Number(targetHoursEnv) * 60
      : 540;

  let extraHeaders: Record<string, string> = {};
  const rawHeaders = optional("KEKA_EXTRA_HEADERS");
  if (rawHeaders) {
    try {
      extraHeaders = JSON.parse(rawHeaders) as Record<string, string>;
    } catch {
      throw new Error("KEKA_EXTRA_HEADERS must be valid JSON");
    }
  }

  return {
    baseUrl,
    summaryPath,
    summaryUrl: `${baseUrl}${summaryPath.startsWith("/") ? summaryPath : `/${summaryPath}`}`,
    tokenUrl:
      optional("KEKA_TOKEN_URL") ?? "https://login.keka.com/connect/token",
    accessToken: required("KEKA_ACCESS_TOKEN"),
    refreshToken: required("KEKA_REFRESH_TOKEN"),
    // These are only required if you need to refresh an expired access token.
    // Your initial fetch can work even without them (as long as access token is still valid).
    clientId: optional("KEKA_CLIENT_ID"),
    clientSecret: optional("KEKA_CLIENT_SECRET"),
    apiKey: optional("KEKA_API_KEY"),
    targetMinutes: Number.isFinite(targetMinutes) ? targetMinutes : 540,
    targetMinutesIsExplicit,
    timezone: optional("KEKA_TIMEZONE") ?? "Asia/Kolkata",
    extraHeaders,
  };
}

export type KekaConfig = ReturnType<typeof getKekaConfig>;
