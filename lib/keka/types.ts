export type AttendanceApiResponse =
  | {
      ok: true;
      data: import("./client").AttendanceSnapshot;
    }
  | {
      ok: false;
      error: string;
      hint?: string;
    };
