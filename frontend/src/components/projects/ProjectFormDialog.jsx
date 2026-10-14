import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import { useAuth } from "../../context/auth-context";
import useApiData from "../../hooks/useApiData";
import { projectsApi, usersApi } from "../../services/endpoints";
import { fullName } from "../../utils/format";

const EMPTY_FORM = {
  name: "", description: "", manager_id: "", start_date: "", end_date: "", budget: "", budget_reason: "",
};

function toForm(project) {
  if (!project) return EMPTY_FORM;
  return {
    name: project.name,
    description: project.description || "",
    manager_id: project.manager_id,
    start_date: project.start_date,
    end_date: project.end_date,
    budget: String(project.budget ?? ""),
    budget_reason: "",
  };
}

function validate(form, isAdmin) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (isAdmin && !form.manager_id) errors.manager_id = "Choose a manager";
  if (!form.start_date) errors.start_date = "Start date is required";
  if (!form.end_date) errors.end_date = "End date is required";
  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    errors.end_date = "End date must be on or after the start date";
  }
  if (form.budget !== "" && (Number.isNaN(Number(form.budget)) || Number(form.budget) < 0)) {
    errors.budget = "Budget must be 0 or more";
  }
  return errors;
}

/** For edits, only send fields that actually changed. */
function buildPayload(form, project, isAdmin) {
  const values = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    start_date: form.start_date,
    end_date: form.end_date,
    budget: form.budget === "" ? 0 : Number(form.budget),
  };
  if (isAdmin) values.manager_id = Number(form.manager_id);
  if (!project) return values;

  const changes = {};
  Object.entries(values).forEach(([field, value]) => {
    if (String(value ?? "") !== String(project[field] ?? "")) changes[field] = value;
  });
  if ("budget" in changes && form.budget_reason.trim()) {
    changes.budget_reason = form.budget_reason.trim();
  }
  return changes;
}

/**
 * Create (no `project`) or edit (with `project`).
 * The parent renders this only while open, so the form starts fresh each time.
 */
export default function ProjectFormDialog({ project, onClose, onSaved }) {
  const { isAdmin } = useAuth();
  const isEdit = Boolean(project);
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [form, setForm] = useState(() => toForm(project));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const managers = useApiData(
    () => (isAdmin ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [isAdmin],
  );

  const budgetChanged = isEdit && form.budget !== "" && Number(form.budget) !== Number(project.budget);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form, isAdmin);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = buildPayload(form, project, isAdmin);
    if (isEdit && Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setSubmitError("");
    try {
      const saved = isEdit
        ? await projectsApi.update(project.id, payload)
        : await projectsApi.create(payload);
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
        <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            <TextField label="Project name" required autoFocus {...fieldProps("name")} />
            <TextField label="Description" multiline minRows={2} {...fieldProps("description")} />
            {isAdmin && (
              <TextField select label="Manager" required {...fieldProps("manager_id")}>
                {managers.loading && <MenuItem disabled>Loading managers...</MenuItem>}
                {(managers.data || []).map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {fullName(manager)} ({manager.username})
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Start date" type="date" required
                slotProps={{ inputLabel: { shrink: true } }}
                {...fieldProps("start_date")}
              />
              <TextField
                label="End date" type="date" required
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.start_date || undefined } }}
                {...fieldProps("end_date")}
              />
            </Stack>
            <TextField
              label="Budget (USD)" type="number"
              slotProps={{ htmlInput: { min: 0, step: 100 } }}
              {...fieldProps("budget")}
            />
            {budgetChanged && (
              <TextField
                label="Reason for budget change"
                placeholder="e.g. Added scope: 20 more servers"
                {...fieldProps("budget_reason")}
                helperText={errors.budget_reason || "Saved in the project's budget history"}
              />
            )}
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
            {isEdit ? "Save changes" : "Create project"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
