import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import { useAuth } from "../context/auth-context";
import useApiData from "../hooks/useApiData";
import { projectsApi } from "../services/endpoints";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import ProjectCard from "../components/projects/ProjectCard";
import { formatCurrency, formatNumber, percent } from "../utils/format";

const cardGrid = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
};

const SUBTITLES = {
  admin: "Overview of all active and completed projects",
  manager: "Projects you manage",
  employee: "Projects you're assigned to",
};

function StatCard({ label, value, hint, icon, color }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Box sx={{ color, fontSize: 36, display: "flex" }}>{icon}</Box>
          <Box>
            <Typography variant="h5" component="p">
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.secondary">
                {hint}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ProjectSection({ title, projects }) {
  if (!projects.length) return null;
  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {title} ({projects.length})
      </Typography>
      <Box sx={cardGrid}>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </Box>
    </Box>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: projects, loading, error, reload } = useApiData(() => projectsApi.list(), []);

  const header = (
    <PageHeader title={`Welcome back, ${user.first_name}`} subtitle={SUBTITLES[user.role]} />
  );

  if (loading && !projects) {
    return (
      <>
        {header}
        <LoadingState message="Loading your projects..." />
      </>
    );
  }
  if (error && !projects) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  const active = projects.filter((p) => p.status === "active");
  const done = projects.filter((p) => p.status === "done");
  const atRisk = active.filter((p) => p.is_overdue || p.is_over_budget);
  const onTrack = active.filter((p) => !p.is_overdue && !p.is_over_budget);
  const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
  const totalSpent = projects.reduce((sum, p) => sum + Number(p.budget_spent || 0), 0);
  const totalWorked = projects.reduce((sum, p) => sum + Number(p.worked_hours), 0);
  const totalPlanned = projects.reduce((sum, p) => sum + Number(p.planned_hours), 0);

  return (
    <>
      {header}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          mb: 4,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        }}
      >
        <StatCard label="Active projects" value={active.length} icon={<FolderOpenOutlinedIcon fontSize="inherit" />} color="primary.main" />
        <StatCard label="Done" value={done.length} icon={<TaskAltOutlinedIcon fontSize="inherit" />} color="success.main" />
        <StatCard
          label="Need attention"
          value={atRisk.length}
          hint="Overdue or over budget"
          icon={<WarningAmberOutlinedIcon fontSize="inherit" />}
          color={atRisk.length ? "error.main" : "text.disabled"}
        />
        {user.role === "employee" ? (
          <StatCard
            label="Hours worked"
            value={formatNumber(totalWorked)}
            hint={`of ${formatNumber(totalPlanned)} planned`}
            icon={<PaidOutlinedIcon fontSize="inherit" />}
            color="secondary.main"
          />
        ) : (
          <StatCard
            label="Budget spent"
            value={`${percent(totalSpent, totalBudget)}%`}
            hint={`${formatCurrency(totalSpent)} of ${formatCurrency(totalBudget)}`}
            icon={<PaidOutlinedIcon fontSize="inherit" />}
            color="secondary.main"
          />
        )}
      </Box>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          message={
            user.role === "employee"
              ? "You haven't been assigned to any projects yet."
              : user.role === "manager"
                ? "Projects assigned to you by an admin will appear here."
                : "Create your first project from the Projects page."
          }
        />
      ) : (
        <>
          <ProjectSection title="Needs attention" projects={atRisk} />
          <ProjectSection title="Active" projects={onTrack} />
          <ProjectSection title="Done" projects={done} />
        </>
      )}
    </>
  );
}
