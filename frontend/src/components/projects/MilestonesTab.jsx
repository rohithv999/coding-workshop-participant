import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import useApiData from "../../hooks/useApiData";
import { milestonesApi } from "../../services/endpoints";
import { formatDate, formatDateTime, MILESTONE_STATUS_LABELS } from "../../utils/format";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import LoadingState from "../LoadingState";
import MilestoneFormDialog from "./MilestoneFormDialog";

const STATUS_COLORS = { not_started: "default", in_progress: "primary", complete: "success" };

export default function MilestonesTab({ project, canManage, onChanged, onNotice }) {
  const { data: milestones, loading, error, reload } = useApiData(
    () => milestonesApi.list(project.id),
    [project.id],
  );
  const [formFor, setFormFor] = useState(null); // null = closed, {} = new, {milestone} = edit
  const [deleting, setDeleting] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const canEdit = canManage && project.status === "active";

  const refreshAll = () => {
    reload();
    onChanged();
  };

  const changeStatus = async (milestone, status) => {
    setUpdatingId(milestone.id);
    setActionError("");
    try {
      await milestonesApi.update(project.id, milestone.id, { status });
      onNotice(`"${milestone.name}" is now ${MILESTONE_STATUS_LABELS[status].toLowerCase()}`);
      refreshAll();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading && !milestones) return <LoadingState message="Loading milestones..." />;
  if (error && !milestones) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      {canManage && project.status === "done" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This project is done, so its milestones are locked. Reopen the project to change them.
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError("")}>
          {actionError}
        </Alert>
      )}

      {canEdit && (
        <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormFor({})}>
            Add milestone
          </Button>
        </Box>
      )}

      {milestones.length === 0 ? (
        <EmptyState
          icon={<FlagOutlinedIcon fontSize="inherit" />}
          title="No milestones yet"
          message={
            canEdit
              ? "Break the project into milestones. The project can be marked done once they're all complete."
              : "Milestones added by the project manager will appear here."
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {milestones.map((milestone) => (
            <Card key={milestone.id}>
              <CardContent>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                        {milestone.name}
                      </Typography>
                      {!canEdit && (
                        <Chip
                          size="small"
                          label={MILESTONE_STATUS_LABELS[milestone.status]}
                          color={STATUS_COLORS[milestone.status]}
                        />
                      )}
                      {milestone.is_overdue && <Chip size="small" label="Overdue" color="error" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(milestone.start_date)} – {formatDate(milestone.end_date)}
                      {milestone.completed_at && ` · Completed ${formatDateTime(milestone.completed_at)}`}
                    </Typography>
                    {milestone.description && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {milestone.description}
                      </Typography>
                    )}
                  </Box>

                  {canEdit && (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
                      <TextField
                        select
                        size="small"
                        label="Status"
                        value={milestone.status}
                        disabled={updatingId === milestone.id}
                        onChange={(e) => changeStatus(milestone, e.target.value)}
                        sx={{ minWidth: 150 }}
                      >
                        {Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Tooltip title="Edit milestone">
                        <IconButton aria-label={`Edit ${milestone.name}`} onClick={() => setFormFor({ milestone })}>
                          <EditOutlinedIcon />
                        </IconButton>
                      </Tooltip>
                      {milestone.status === "not_started" && (
                        <Tooltip title="Delete milestone">
                          <IconButton
                            aria-label={`Delete ${milestone.name}`}
                            color="error"
                            onClick={() => setDeleting(milestone)}
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {formFor && (
        <MilestoneFormDialog
          project={project}
          milestone={formFor.milestone}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            onNotice(formFor.milestone ? "Milestone updated" : "Milestone added");
            setFormFor(null);
            refreshAll();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title="Delete this milestone?"
          message={`"${deleting.name}" hasn't started yet, so it can be removed. This can't be undone.`}
          confirmLabel="Delete"
          confirmColor="error"
          onConfirm={async () => {
            await milestonesApi.remove(project.id, deleting.id);
            onNotice("Milestone deleted");
            refreshAll();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
