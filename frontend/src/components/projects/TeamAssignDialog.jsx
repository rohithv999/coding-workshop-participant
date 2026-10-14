import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem,
  ListItemText, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useAuth } from "../../context/auth-context";
import useApiData from "../../hooks/useApiData";
import { assignmentsApi, usersApi } from "../../services/endpoints";
import { formatNumber, fullName } from "../../utils/format";

function skipReason(item) {
  if (item.available_hours_per_day !== undefined) {
    return `Only ${formatNumber(item.available_hours_per_day)} h/day free during these dates`;
  }
  return item.reason;
}

/** Assign every active employee who reports to a manager. Shows who was added and who was skipped. */
export default function TeamAssignDialog({ project, onClose, onAssigned }) {
  const { isAdmin } = useAuth();
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const managers = useApiData(
    () => (isAdmin ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [isAdmin],
  );
  const [form, setForm] = useState({
    manager_id: project.manager_id,
    hours_per_day: "8",
    start_date: project.start_date,
    end_date: project.end_date,
  });
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const handleChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const hours = Number(form.hours_per_day);
    if (Number.isNaN(hours) || hours < 0.5 || hours > 8) {
      setSubmitError("Hours per day must be between 0.5 and 8");
      return;
    }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
      setSubmitError("Choose a valid date range");
      return;
    }
    const payload = { hours_per_day: hours, start_date: form.start_date, end_date: form.end_date };
    if (isAdmin) payload.manager_id = Number(form.manager_id);

    setSaving(true);
    setSubmitError("");
    try {
      const response = await assignmentsApi.assignTeam(project.id, payload);
      setResult(response);
      if (response.assigned.length) onAssigned(response.assigned.length);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
        <DialogTitle>Team assignment results</DialogTitle>
        <DialogContent>
          <Alert severity={result.assigned.length ? "success" : "info"} sx={{ mb: 2 }}>
            Assigned {result.assigned.length}, skipped {result.skipped.length}.
          </Alert>
          {result.assigned.length > 0 && (
            <>
              <Typography variant="subtitle2">Added</Typography>
              <List dense>
                {result.assigned.map((a) => (
                  <ListItem key={a.id} disableGutters>
                    <ListItemText primary={a.user_name} secondary={`${formatNumber(a.hours_per_day)} h/day`} />
                  </ListItem>
                ))}
              </List>
            </>
          )}
          {result.skipped.length > 0 && (
            <>
              <Typography variant="subtitle2">Skipped</Typography>
              <List dense>
                {result.skipped.map((s) => (
                  <ListItem key={s.id} disableGutters>
                    <ListItemText primary={s.user_name} secondary={skipReason(s)} />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>Assign a team</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              Adds every active employee who reports to the chosen manager. People already on the project, or
              without enough free hours, are skipped.
            </Typography>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            {isAdmin && (
              <TextField select label="Team of manager" value={form.manager_id} onChange={handleChange("manager_id")} disabled={saving} fullWidth>
                {(managers.data || []).map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {fullName(manager)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Hours per day"
              type="number"
              value={form.hours_per_day}
              onChange={handleChange("hours_per_day")}
              disabled={saving}
              slotProps={{ htmlInput: { min: 0.5, max: 8, step: 0.5 } }}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Start date" type="date" value={form.start_date} onChange={handleChange("start_date")}
                disabled={saving} fullWidth
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: project.start_date, max: project.end_date } }}
              />
              <TextField
                label="End date" type="date" value={form.end_date} onChange={handleChange("end_date")}
                disabled={saving} fullWidth
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.start_date, max: project.end_date } }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Assign team
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
