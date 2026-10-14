const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export const ROLE_LABELS = { admin: "Admin", manager: "Manager", employee: "Employee" };
export const MILESTONE_STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

/**
 * Format a date-only value like "2026-10-01".
 * new Date("2026-10-01") is treated as midnight UTC, which shows as Sep 30 in US
 * time zones - so build the date from its parts in local time instead.
 */
export function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fullName(user) {
  return user ? `${user.first_name} ${user.last_name}` : "";
}

export function percent(part, total) {
  const whole = Number(total);
  if (!whole) return 0;
  return Math.round((Number(part) / whole) * 100);
}

export const COST_CATEGORY_LABELS = {
  technology: "Technology",
  software: "Software",
  hardware: "Hardware",
  services: "Services",
  travel: "Travel",
  other: "Other",
};
