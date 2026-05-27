import { AttendanceTracker } from "./components/AttendanceTracker";

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black">
      <AttendanceTracker />
    </div>
  );
}
