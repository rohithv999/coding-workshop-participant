import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import { useAuth } from "../../context/auth-context";
import useApiData from "../../hooks/useApiData";
import { usersApi } from "../../services/endpoints";
import { fullName, ROLE_LABELS } from "../../utils/format";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function toForm(user) {
  return {
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
    job_title: user?.job_title || "",
    role: user?.role || "employee",
    manager_id: user?.manager_id ?? "",
    hourly_rate: user ? String(user.hourly_rate ?? 0) : "",
    password: "",
  };
}

function validate(form, { isAdmin, isEdit }) {
  const errors = {};
  if (!form.first_name.trim()) errors.first_name = "First name is required";
  if (!form.last_name.trim()) errors.last_name = "Last name is required";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address";
  if (isAdmin) {
    if (form.role === "employee" && !form.manager_id) errors.manager_id = "Employees need a manager";
    const rate = Number(form.hourly_rate || 0);
    if (Number.isNaN(rate) || rate < 0) errors.hourly_rate = "Hourly rate must be 0 or more";
  }
  if (!isEdit) {
    const pw = form.password;
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) {
      errors.password = "At least 8 characters, with a letter and a number";
    }
  }
  return errors;
}

function buildPayload(form, user, isAdmin) {
  const values = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    email: form.email.trim().toLowerCase(),
  };
  if (isAdmin) {
    values.job_title = form.job_title.trim() || null;
    values.role = form.role;
    values.manager_id = form.role === "employee" ? Number(form.manager_id) : null;
    values.hourly_rate = Number(form.hourly_rate || 0);
  }
  if (!user) return { ...values, password: form.password };

  const changes = {};
  Object.entries(values).forEach(([field, value]) => {
    if (String(value ?? "") !== String(user[field] ?? "")) changes[field] = value;
  });
  return changes;
}

/** Create (admins) or edit a user. Managers can only edit name and email. */
export default function UserFormDialog({ user, onClose, onSaved }) {
  const { user: me, isAdmin } = useAuth();
  const isEdit = Boolean(user);
  const isSelf = isEdit && user.id === me.id;
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const managers = useApiData(
    () => (isAdmin ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [isAdmin],
  );
  const [form, setForm] = useState(() => toForm(user));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form, { isAdmin, isEdit });
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = buildPayload(form, user, isAdmin);
    if (isEdit && Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      const saved = isEdit ? await usersApi.update(user.id, payload) : await usersApi.create(payload);
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
        <DialogTitle>{isEdit ? `Edit ${fullName(user)}` : "New user"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="First name" required autoFocus {...fieldProps("first_name")} />
              <TextField label="Last name" required {...fieldProps("last_name")} />
            </Stack>
            <TextField label="Email" type="email" required autoComplete="off" {...fieldProps("email")} />

            {isAdmin && (
              <>
                <TextField label="Job title" {...fieldProps("job_title")} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    select
                    label="Role"
                    required
                    {...fieldProps("role")}
                    disabled={saving || isSelf}
                    helperText={errors.role || (isSelf ? "You can't change your own role" : undefined)}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Hourly rate (USD)"
                    type="number"
                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                    {...fieldProps("hourly_rate")}
                  />
                </Stack>
                {form.role === "employee" && (
                  <TextField select label="Manager" required {...fieldProps("manager_id")}>
                    {managers.loading && <MenuItem disabled>Loading managers...</MenuItem>}
                    {(managers.data || []).map((manager) => (
                      <MenuItem key={manager.id} value={manager.id}>
                        {fullName(manager)} ({manager.username})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </>
            )}

            {!isEdit && (
              <TextField
                label="Initial password"
                type="password"
                required
                autoComplete="new-password"
                {...fieldProps("password")}
                helperText={errors.password || "At least 8 characters, with a letter and a number. They can change it later."}
              />
            )}
            {!isEdit && (
              <Alert severity="info">A 6-character username will be generated automatically.</Alert>
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
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
