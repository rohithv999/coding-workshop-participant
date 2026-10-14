import { Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { formatCurrency, percent } from "../../utils/format";

export function ProjectStatusChip({ project, size = "small" }) {
  if (project.is_archived) return <Chip label="Archived" size={size} />;
  if (project.status === "done") return <Chip label="Done" color="success" size={size} />;
  return <Chip label="Active" color="primary" variant="outlined" size={size} />;
}

/** Warning chips that answer "which projects are at risk?" */
export function RiskChips({ project, size = "small" }) {
  if (!project.is_overdue && !project.is_over_budget) return null;
  return (
    <Stack direction="row" spacing={0.5}>
      {project.is_overdue && <Chip label="Overdue" color="error" size={size} />}
      {project.is_over_budget && <Chip label="Over budget" color="warning" size={size} />}
    </Stack>
  );
}

function LabeledBar({ label, valueText, value, color, ariaLabel }) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {valueText}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(value, 100)}
        color={color}
        aria-label={ariaLabel}
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
}

/** Milestone progress: the "status bar" for active and done projects */
export function MilestoneProgress({ project }) {
  const total = project.milestones_total;
  return (
    <LabeledBar
      label={total ? `${project.milestones_complete} of ${total} milestones` : "No milestones yet"}
      valueText={`${project.progress_percent}%`}
      value={project.progress_percent}
      color={project.status === "done" ? "success" : "primary"}
      ariaLabel={`Milestone progress ${project.progress_percent} percent`}
    />
  );
}

/** Budget consumed vs planned */
export function BudgetBar({ project }) {
  const used = percent(project.budget_spent, project.budget);
  const color = used >= 100 ? "error" : used >= 75 ? "warning" : "secondary";
  return (
    <LabeledBar
      label={`${formatCurrency(project.budget_spent)} of ${formatCurrency(project.budget)} spent`}
      valueText={`${used}%`}
      value={used}
      color={color}
      ariaLabel={`Budget used ${used} percent`}
    />
  );
}
