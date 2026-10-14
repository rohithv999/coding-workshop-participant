import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import useApiData from "../../hooks/useApiData";
import { assignmentsApi, usersApi } from "../../services/endpoints";
import { describeAssignmentError } from "../../utils/assignments";
import { formatDate, fullName } from "../../utils/format";

function validate(form, project, isEdit) {
  const errors = {};
  if (!isEdit && !form.user_id) errors.user_id = "Choose an employee";
  const hours = Number(form.hours_per_day);
  if (form.hours_per_day === "" || Number.isNaN(hours) || hours < 0.5 || hours > 8) {
    errors.hours_per_day = "Enter between 0.5 and 8 hours per day";
  }
  if (!form.start_date) errors.start_date = "Start date is required";
  else if (form.start_date < project.start_date) {
    errors.start_date = `Must be on or after ${formatDate(project.start_date)}`;
  }
  if (!form.end_date) errors.end_date = "End date is required";
  else if (form.end_date > project.end_date) {
    errors.end_date = `Must be on or before ${formatDate(project.end_date)}`;
  } else if (form.start_date && form.end_date < form.start_date) {
    errors.end_date = "End date must be on or after the start date";
  }
  return errors;
}

/** Assign one employee (no `assignment`) or edit an existing assignment. */
export default function AssignmentFormDialog({ project, assignment, assignedUserIds, onClose, onSaved }) {
  const isEdit = Boolean(assignment);
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const employees = useApiData(
    () => (isEdit ? Promise.resolve([]) : usersApi.list({ role: "employee" })),
    [isEdit],
  );
  const [form, setForm] = useState(() => ({
    user_id: assignment?.user_id ?? "",
    hours_per_day: String(assignment?.hours_per_day ?? 8),
    start_date: assignment?.start_date ?? project.start_date,
    end_date: assignment?.end_date ?? project.end_date,
  }));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const available = (employees.data || []).filter((e) => !assignedUserIds.includes(e.id));

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form, project, isEdit);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      hours_per_day: Number(form.hours_per_day),
      start_date: form.start_date,
      end_date: form.end_date,
    };
    setSaving(true);
    setSubmitError("");
    try {
      const saved = isEdit
        ? await assignmentsApi.update(project.id, assignment.id, payload)
        : await assignmentsApi.create(project.id, { ...payload, user_id: Number(form.user_id) });
      onSaved(saved);
    } catch (error) {
      setSubmitError(describeAssignmentError(error));
      const fieldErrors = { ...(error.details || {}) };
      if (fieldErrors.available_hours_per_day !== undefined) {
        fieldErrors.hours_per_day = `Only ${fieldErrors.available_hours_per_day} h/day available`;
      }
      setErrors(fieldErrors);
      setSaving(false);
    }
  };

  const fieldProps = (field) => ({
    value: form[field],
    onChange: handleChange(field),
    error: Boolean(errors[field]),
    helperText: errors[field],
    disabled: saving,
    fullWidth: true,
  });

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? `Edit ${assignment.user_name}'s assignment` : "Add person to project"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            {isEdit ? (
              <TextField label="Employee" value={assignment.user_name} disabled fullWidth />
            ) : (
              <TextField select label="Employee" required autoFocus {...fieldProps("user_id")}>
                {employees.loading && <MenuItem disabled>Loading employees...</MenuItem>}
                {!employees.loading && available.length === 0 && (
                  <MenuItem disabled>Everyone is already on this project</MenuItem>
                )}
                {available.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {fullName(employee)} {employee.job_title ? `· ${employee.job_title}` : ""}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Hours per day"
              type="number"
              required
              slotProps={{ htmlInput: { min: 0.5, max: 8, step: 0.5 } }}
              {...fieldProps("hours_per_day")}
              helperText={errors.hours_per_day || "Full time is 8 hours/day (40 hours/week)"}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Start date" type="date" required
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: project.start_date, max: project.end_date } }}
                {...fieldProps("start_date")}
              />
              <TextField
                label="End date" type="date" required
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: form.start_date || project.start_date, max: project.end_date },
                }}
                {...fieldProps("end_date")}
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
            {isEdit ? "Save changes" : "Add to project"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
