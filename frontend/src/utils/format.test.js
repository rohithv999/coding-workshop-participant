import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatNumber, fullName, percent } from "./format";

describe("formatDate", () => {
  it("keeps date-only values on the right day in every time zone", () => {
    // new Date("2026-10-01") is midnight UTC, which shows as Sep 30 in US time zones
    expect(formatDate("2026-10-01")).toBe("Oct 1, 2026");
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("shows a dash for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars with separators", () => {
    expect(formatCurrency(60000)).toBe("$60,000");
    expect(formatCurrency("1234.56")).toBe("$1,235");
  });

  it("treats missing values as zero", () => {
    expect(formatCurrency(undefined)).toBe("$0");
  });
});

describe("numbers, percents, and names", () => {
  it("formats hours with at most one decimal", () => {
    expect(formatNumber(132)).toBe("132");
    expect(formatNumber(7.25)).toBe("7.3");
  });

  it("calculates percentages safely", () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(2700, 60000)).toBe(5);
    expect(percent(5, 0)).toBe(0); // no division by zero
  });

  it("joins first and last names", () => {
    expect(fullName({ first_name: "Sam", last_name: "Chen" })).toBe("Sam Chen");
    expect(fullName(null)).toBe("");
  });
});
