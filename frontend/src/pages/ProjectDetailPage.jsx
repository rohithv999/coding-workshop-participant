import { useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Divider, LinearProgress, Snackbar, Stack, Tab, Tabs, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ReplayIcon from "@mui/icons-material/Replay";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import { useAuth } from "../context/auth-context";
import useApiData from "../hooks/useApiData";
import { projectsApi } from "../services/endpoints";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import MilestonesTab from "../components/projects/MilestonesTab";
import ProjectFormDialog from "../components/projects/ProjectFormDialog";
import TeamTab from "../components/projects/TeamTab";
import {
  BudgetBar, MilestoneProgress, ProjectStatusChip, RiskChips,
} from "../components/projects/ProjectIndicators";
import { formatCurrency, formatDate, formatNumber } from "../utils/format";

function Stat({ label, value }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="p">
        {value}
      </Typography>
    </Box>
  );
}

function OverviewTab({ project }) {
  const showBudget = project.budget !== undefined;
  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Details
          </Typography>
          <Typography color={project.description ? "text.primary" : "text.secondary"} sx={{ mb: 2 }}>
            {project.description || "No description provided."}
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
            <Stat label="Manager" value={project.manager_name} />
            <Stat label="Start date" value={formatDate(project.start_date)} />
            <Stat label="End date" value={formatDate(project.end_date)} />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Progress
          </Typography>
          <Stack spacing={2}>
            <MilestoneProgress project={project} />
            {showBudget && <BudgetBar project={project} />}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
            <Stat label="Team size" value={project.team_size} />
            <Stat label="Planned hours" value={formatNumber(project.planned_hours)} />
            <Stat label="Hours worked" value={formatNumber(project.worked_hours)} />
            {showBudget && <Stat label="Budget" value={formatCurrency(project.budget)} />}
            {showBudget && <Stat label="Committed" value={formatCurrency(project.budget_committed)} />}
            {showBudget && <Stat label="Spent" value={formatCurrency(project.budget_spent)} />}
            {showBudget && <Stat label="Remaining" value={formatCurrency(project.budget_remaining)} />}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ComingNext({ name }) {
  return <EmptyState title={`${name} coming next`} message="This tab is built in the next step." />;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: project, loading, error, reload } = useApiData(() => projectsApi.get(projectId), [projectId]);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");

  if (loading && !project) return <LoadingState message="Loading project..." />;
  if (error && !project) {
    if (error.status === 404) {
      return (
        <EmptyState
          title="Project not found"
          message="It may have been archived, or you may not have access to it."
          action={<Button component={RouterLink} to="/projects">Back to projects</Button>}
        />
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }

  const canManage = !project.is_archived && (isAdmin || project.manager_id === user.id);
  const showBudgetTab = project.budget !== undefined;

  const runAction = (title, message, confirmLabel, action, successMessage, confirmColor = "primary") =>
    setConfirm({
      title,
      message,
      confirmLabel,
      confirmColor,
      onConfirm: async () => {
        await action();
        setNotice(successMessage);
        reload();
      },
    });

  const actions = [];
  if (canManage) {
    actions.push(
      <Button key="edit" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
        Edit
      </Button>,
    );
    if (project.status === "active") {
      actions.push(
        <Button
          key="done"
          variant="contained"
          color="success"
          startIcon={<TaskAltIcon />}
          onClick={() =>
            runAction(
              "Mark project as done?",
              "All milestones must be complete. Milestones will be locked once the project is done.",
              "Mark done",
              () => projectsApi.complete(project.id),
              "Project marked as done",
              "success",
            )
          }
        >
          Mark done
        </Button>,
      );
    } else {
      actions.push(
        <Button
          key="reopen"
          variant="outlined"
          startIcon={<ReplayIcon />}
          onClick={() =>
            runAction(
              "Reopen this project?",
              "The project will become active again and its milestones can be edited.",
              "Reopen",
              () => projectsApi.reopen(project.id),
              "Project reopened",
            )
          }
        >
          Reopen
        </Button>,
      );
    }
  }
  if (isAdmin && !project.is_archived) {
    actions.push(
      <Button
        key="archive"
        color="error"
        startIcon={<ArchiveOutlinedIcon />}
        onClick={() =>
          setConfirm({
            title: "Archive this project?",
            message: "It will be hidden from managers and employees. Admins can restore it from the Archive page.",
            confirmLabel: "Archive",
            confirmColor: "error",
            onConfirm: async () => {
              await projectsApi.archive(project.id);
              navigate("/projects");
            },
          })
        }
      >
        Archive
      </Button>,
    );
  }

  return (
    <>
      <Button component={RouterLink} to="/projects" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>
        All projects
      </Button>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2, justifyContent: "space-between", alignItems: { xs: "stretch", md: "flex-start" } }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Typography variant="h4" component="h1">
              {project.name}
            </Typography>
            <ProjectStatusChip project={project} size="medium" />
            <RiskChips project={project} />
          </Stack>
          <Typography color="text.secondary">
            Managed by {project.manager_name} · {formatDate(project.start_date)} – {formatDate(project.end_date)}
          </Typography>
        </Box>
        {actions.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {actions}
          </Stack>
        )}
      </Stack>

      {project.is_archived && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This project is archived and read-only. Restore it from the Archive page to make changes.
        </Alert>
      )}

      <Box sx={{ height: 4 }}>{loading && <LinearProgress />}</Box>

      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="overview" label="Overview" />
        <Tab value="milestones" label={`Milestones (${project.milestones_total})`} />
        <Tab value="team" label={`Team (${project.team_size})`} />
        {showBudgetTab && <Tab value="budget" label="Budget history" />}
      </Tabs>

      {tab === "overview" && <OverviewTab project={project} />}
      {tab === "milestones" && (
        <MilestonesTab project={project} canManage={canManage} onChanged={reload} onNotice={setNotice} />
      )}
      {tab === "team" && (
        <TeamTab project={project} canManage={canManage} onChanged={reload} onNotice={setNotice} />
      )}
      {tab === "budget" && showBudgetTab && <ComingNext name="Budget history" />}

      {editing && (
        <ProjectFormDialog
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Project updated");
            reload();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          confirmColor={confirm.confirmColor}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={3000}
        onClose={() => setNotice("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
