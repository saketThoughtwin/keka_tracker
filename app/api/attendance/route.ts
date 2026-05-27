import { NextResponse } from "next/server";
import { fetchAttendanceSnapshot } from "@/lib/keka/client";
import { getKekaConfig } from "@/lib/keka/config";
import type { AttendanceApiResponse } from "@/lib/keka/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getKekaConfig();
    const data = await fetchAttendanceSnapshot(config);
    return NextResponse.json({ ok: true, data } satisfies AttendanceApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch attendance";
    const hint =
      message.includes("Missing environment")
        ? "Copy .env.example to .env.local and fill tokens from Keka DevTools."
        : message.includes("summary API")
          ? "Open Keka → Network → click summary → copy Request URL path into KEKA_SUMMARY_PATH."
          : undefined;

    return NextResponse.json(
      { ok: false, error: message, hint } satisfies AttendanceApiResponse,
      { status: 500 },
    );
  }
}
