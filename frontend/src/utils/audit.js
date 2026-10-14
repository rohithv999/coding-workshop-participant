import {
  COST_CATEGORY_LABELS, formatCurrency, formatDate, MILESTONE_STATUS_LABELS, ROLE_LABELS,
} from "./format";

export const ACTION_LABELS = {
  create: "Created",
  update: "Updated",
  archive: "Archived",
  unarchive: "Restored",
  delete: "Deleted",
  end: "Ended",
  complete: "Marked done",
  reopen: "Reopened",
  change_password: "Changed password",
};

export const ACTION_COLORS = {
  create: "success",
  update: "primary",
  archive: "warning",
  unarchive: "info",
  delete: "error",
  end: "warning",
  complete: "success",
  reopen: "info",
  change_password: "default",
};

export const ENTITY_LABELS = {
  user: "User",
  project: "Project",
  assignment: "Assignment",
  milestone: "Milestone",
  cost: "Cost",
};

const FIELD_LABELS = {
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  username: "Username",
  job_title: "Job title",
  role: "Role",
  manager_id: "Manager ID",
  hourly_rate: "Hourly rate",
  name: "Name",
  description: "Description",
  start_date: "Start",
  end_date: "End",
  budget: "Budget",
  status: "Status",
  hours_per_day: "Hours/day",
  user_name: "Employee",
  via: "Via",
  category: "Category",
  amount: "Amount",
  cost_date: "Date",
};

const STATUS_LABELS = { ...MILESTONE_STATUS_LABELS, active: "Active", done: "Done" };

function formatValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "budget" || field === "hourly_rate" || field === "amount") return formatCurrency(value);
  if (field === "category") return COST_CATEGORY_LABELS[value] || value;
  if (field.endsWith("_date")) return formatDate(value);
  if (field === "status") return STATUS_LABELS[value] || value;
  if (field === "role") return ROLE_LABELS[value] || value;
  return String(value);
}

/** Returns a list of short sentences describing an entry's changes. */
export function describeChanges(changes) {
  if (!changes) return [];
  return Object.entries(changes)
    .filter(([field]) => !(field === "user_id" && "user_name" in changes))
    .map(([field, value]) => {
      const label = FIELD_LABELS[field] || field;
      if (value && typeof value === "object" && "from" in value) {
        const reason = value.reason ? ` ("${value.reason}")` : "";
        return `${label}: ${formatValue(field, value.from)} → ${formatValue(field, value.to)}${reason}`;
      }
      return `${label}: ${formatValue(field, value)}`;
    });
}
