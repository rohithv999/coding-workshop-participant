import { useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import GroupsIcon from "@mui/icons-material/Groups";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import useApiData from "../../hooks/useApiData";
import { assignmentsApi } from "../../services/endpoints";
import { todayIso } from "../../utils/assignments";
import { formatCurrency, formatDate, formatNumber } from "../../utils/format";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import LoadingState from "../LoadingState";
import AssignmentFormDialog from "./AssignmentFormDialog";
import TeamAssignDialog from "./TeamAssignDialog";

export default function TeamTab({ project, canManage, onChanged, onNotice }) {
  const { data: assignments, loading, error, reload } = useApiData(
    () => assignmentsApi.list(project.id),
    [project.id],
  );
  const [formFor, setFormFor] = useState(null); // null = closed, {} = new, {assignment} = edit
  const [teamOpen, setTeamOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const today = todayIso();

  const refreshAll = () => {
    reload();
    onChanged();
  };

  if (loading && !assignments) return <LoadingState message="Loading team..." />;
  if (error && !assignments) return <ErrorState error={error} onRetry={reload} />;

  // Employees don't receive cost fields from the API
  const showCosts = assignments.length > 0 && assignments[0].planned_cost !== undefined;

  return (
    <>
      {canManage && (
        <Stack direction="row" sx={{ mb: 2, justifyContent: "flex-end", flexWrap: "wrap", gap: 1 }}>
          <Button variant="outlined" startIcon={<GroupAddIcon />} onClick={() => setTeamOpen(true)}>
            Assign team
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormFor({})}>
            Add person
          </Button>
        </Stack>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          icon={<GroupsIcon fontSize="inherit" />}
          title="No one assigned yet"
          message={canManage ? "Add people individually, or assign a manager's whole team at once." : undefined}
        />
      ) : (
        <Stack spacing={1.5}>
          {assignments.map((a) => {
            const ended = a.end_date < today;
            return (
              <Card key={a.id}>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                          {a.user_name}
                        </Typography>
                        {ended && <Chip size="small" label="Ended" />}
                        {a.user_is_archived && <Chip size="small" label="Archived user" />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {[a.job_title, a.username].filter(Boolean).join(" · ")}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {formatNumber(a.hours_per_day)} h/day · {formatDate(a.start_date)} – {formatDate(a.end_date)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatNumber(a.worked_hours)} of {formatNumber(a.planned_hours)} hours worked
                        {showCosts && ` · ${formatCurrency(a.worked_cost)} of ${formatCurrency(a.planned_cost)}`}
                      </Typography>
                    </Box>
                    {canManage && (
                      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <Tooltip title="Edit hours or dates">
                          <IconButton aria-label={`Edit ${a.user_name}'s assignment`} onClick={() => setFormFor({ assignment: a })}>
                            <EditOutlinedIcon />
                          </IconButton>
                        </Tooltip>
                        {!ended && (
                          <Tooltip title="Remove from project">
                            <IconButton aria-label={`Remove ${a.user_name}`} color="error" onClick={() => setRemoving(a)}>
                              <DeleteOutlinedIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {formFor && (
        <AssignmentFormDialog
          project={project}
          assignment={formFor.assignment}
          assignedUserIds={assignments.map((a) => a.user_id)}
          onClose={() => setFormFor(null)}
          onSaved={(saved) => {
            onNotice(formFor.assignment ? "Assignment updated" : `${saved.user_name} added to the project`);
            setFormFor(null);
            refreshAll();
          }}
        />
      )}

      {teamOpen && (
        <TeamAssignDialog
          project={project}
          onClose={() => setTeamOpen(false)}
          onAssigned={(count) => {
            onNotice(`${count} ${count === 1 ? "person" : "people"} assigned`);
            refreshAll();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          title={`Remove ${removing.user_name}?`}
          message={
            removing.start_date > today
              ? "Their assignment hasn't started yet, so it will be removed completely."
              : "Their assignment will end today. Hours already worked stay on the project's budget."
          }
          confirmLabel="Remove"
          confirmColor="error"
          onConfirm={async () => {
            await assignmentsApi.remove(project.id, removing.id);
            onNotice(`${removing.user_name} removed from the project`);
            refreshAll();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}
