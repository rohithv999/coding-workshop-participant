import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import { milestonesApi } from "../../services/endpoints";
import { formatDate, MILESTONE_STATUS_LABELS } from "../../utils/format";

function toForm(milestone) {
  return {
    name: milestone?.name || "",
    description: milestone?.description || "",
    start_date: milestone?.start_date || "",
    end_date: milestone?.end_date || "",
    status: milestone?.status || "not_started",
  };
}

function validate(form, project) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (!form.start_date) errors.start_date = "Start date is required";
  else if (form.start_date < project.start_date) {
    errors.start_date = `Must be on or after the project start (${formatDate(project.start_date)})`;
  }
  if (!form.end_date) errors.end_date = "End date is required";
  else if (form.end_date > project.end_date) {
    errors.end_date = `Must be on or before the project end (${formatDate(project.end_date)})`;
  } else if (form.start_date && form.end_date < form.start_date) {
    errors.end_date = "End date must be on or after the start date";
  }
  return errors;
}

export default function MilestoneFormDialog({ project, milestone, onClose, onSaved }) {
  const isEdit = Boolean(milestone);
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [form, setForm] = useState(() => toForm(milestone));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form, project);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.status,
    };
    setSaving(true);
    setSubmitError("");
    try {
      const saved = isEdit
        ? await milestonesApi.update(project.id, milestone.id, payload)
        : await milestonesApi.create(project.id, payload);
      onSaved(saved);
    } catch (error) {
      setSubmitError(error.message);
      if (error.details) setErrors(error.details);
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
        <DialogTitle>{isEdit ? "Edit milestone" : "New milestone"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            <TextField
              label="Milestone name"
              placeholder="e.g. Scope and analyze servers to decommission"
              required
              autoFocus
              {...fieldProps("name")}
            />
            <TextField
              label="Goals / definition of done"
              placeholder="What must be true for this milestone to be complete?"
              multiline
              minRows={2}
              {...fieldProps("description")}
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
            <TextField select label="Status" {...fieldProps("status")}>
              {Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
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
            {isEdit ? "Save changes" : "Add milestone"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
