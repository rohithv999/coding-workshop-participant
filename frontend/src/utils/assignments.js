import { formatNumber } from "./format";

/** Today's date as "YYYY-MM-DD" in local time (for comparing with date-only values). */
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Turn the backend's 409 capacity error into a clear sentence. */
export function describeAssignmentError(error) {
  const available = error.details?.available_hours_per_day;
  if (available === undefined) return error.message;
  return `${error.message}. They have ${formatNumber(available)} h/day free during these dates.`;
}
