import axios from "axios";
import { getValidAccessToken } from "./auth";
import type { KekaConfig } from "./config";
import { extractHoursFromSummary } from "./extract-hours";
import { formatClock, formatMinutes, todayInTimezone } from "./duration";

export type AttendanceSnapshot = {
  completedMinutes: number;
  remainingMinutes: number;
  targetMinutes: number;
  outsideMinutes: number;
  completedLabel: string;
  remainingLabel: string;
  targetLabel: string;
  outsideLabel: string;
  lastOutLabel: string | null;
  lastBreakDurationLabel: string | null;
  currentlyOutside: boolean;
  timeToHomeMinutes: number | null;
  timeToHomeLabel: string | null;
  progressPercent: number;
  date: string;
  fetchedAt: string;
  source: string;
};

export async function fetchAttendanceSnapshot(
  config: KekaConfig,
): Promise<AttendanceSnapshot> {
  const accessToken = await getValidAccessToken(config);
  const date = todayInTimezone(config.timezone);
  const nowMs = Date.now();
  const params = { date, attendanceDate: date, fromDate: date, toDate: date };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...config.extraHeaders,
  };

  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  const response = await axios.get(config.summaryUrl, {
    headers,
    params,
  });

  const { data, status } = response;
  if (status >= 400) {
    throw new Error(
      `Keka summary API returned ${status} for ${config.summaryUrl}. Check KEKA_BASE_URL and KEKA_SUMMARY_PATH match the DevTools “summary” Request URL.`,
    );
  }

  const payload =
    data && typeof data === "object" && "data" in (data as object)
      ? (data as { data: unknown }).data
      : data;

  // Your Thoughtwin endpoint returns an array (date range). Prefer today's row.
  const payloadForToday =
    Array.isArray(payload)
      ? payload.find(
          (row) =>
            row &&
            typeof row === "object" &&
            "attendanceDate" in row &&
            typeof (row as { attendanceDate?: unknown }).attendanceDate === "string" &&
            (row as { attendanceDate: string }).attendanceDate.startsWith(date),
        ) ?? payload[0]
      : payload;

  const extracted = extractHoursFromSummary(payloadForToday, config.targetMinutes, {
    nowMs,
    timeZone: config.timezone,
    targetMinutesIsExplicit: config.targetMinutesIsExplicit,
  });

  const completedMinutes = Math.min(extracted.completedMinutes, extracted.targetMinutes);
  const remainingMinutes = Math.max(0, extracted.targetMinutes - completedMinutes);
  const timeToHomeMinutes = remainingMinutes;

  const progressPercent =
    extracted.targetMinutes > 0
      ? Math.min(100, Math.round((completedMinutes / extracted.targetMinutes) * 100))
      : 0;

  return {
    completedMinutes,
    remainingMinutes,
    targetMinutes: extracted.targetMinutes,
    completedLabel: formatMinutes(completedMinutes),
    remainingLabel: formatMinutes(remainingMinutes),
    targetLabel: formatMinutes(extracted.targetMinutes),
    outsideMinutes: extracted.outsideMinutes,
    outsideLabel: formatMinutes(extracted.outsideMinutes),
    lastOutLabel:
      extracted.lastOutEpochMs != null
        ? formatClock(extracted.lastOutEpochMs, config.timezone)
        : null,
    lastBreakDurationLabel:
      extracted.lastBreakDurationMinutes != null
        ? formatMinutes(extracted.lastBreakDurationMinutes)
        : null,
    currentlyOutside: extracted.currentlyOutside,
    timeToHomeMinutes,
    timeToHomeLabel: formatMinutes(timeToHomeMinutes),
    progressPercent,
    date,
    fetchedAt: new Date().toISOString(),
    source: extracted.source,
  };
}
