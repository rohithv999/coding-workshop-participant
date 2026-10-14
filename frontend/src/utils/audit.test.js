import { describe, expect, it } from "vitest";
import { describeChanges } from "./audit";

describe("describeChanges", () => {
  it("formats money changes, including the reason", () => {
    const lines = describeChanges({
      budget: { from: 39600, to: 35000, reason: "Extra switch hardware" },
    });
    expect(lines).toEqual(['Budget: $39,600 → $35,000 ("Extra switch hardware")']);
  });

  it("uses readable labels for statuses, roles, and dates", () => {
    const lines = describeChanges({
      status: { from: "active", to: "done" },
      role: { from: "employee", to: "manager" },
      end_date: { from: "2026-10-31", to: "2026-11-30" },
    });
    expect(lines).toEqual([
      "Status: Active → Done",
      "Role: Employee → Manager",
      "End: Oct 31, 2026 → Nov 30, 2026",
    ]);
  });

  it("describes snapshots and hides raw ids when a name is available", () => {
    const lines = describeChanges({ user_id: 3, user_name: "Sam Chen", hours_per_day: 6 });
    expect(lines).toEqual(["Employee: Sam Chen", "Hours/day: 6"]);
  });

  it("shows a dash for empty values and handles entries with no changes", () => {
    expect(describeChanges({ description: { from: null, to: "Notes" } })).toEqual(["Description: — → Notes"]);
    expect(describeChanges(null)).toEqual([]);
  });
});
