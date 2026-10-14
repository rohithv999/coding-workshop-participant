import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography,
} from "@mui/material";
import { useAuth } from "../context/auth-context";
import { authApi } from "../services/endpoints";
import PageHeader from "../components/PageHeader";
import { ROLE_LABELS } from "../utils/format";

function ReadOnlyField({ label, value }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value || "—"}</Typography>
    </Box>
  );
}

function NameCard() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // { severity, message }
  const [saving, setSaving] = useState(false);

  const changed = form.first_name.trim() !== user.first_name || form.last_name.trim() !== user.last_name;

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setStatus(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!form.first_name.trim()) found.first_name = "First name is required";
    if (!form.last_name.trim()) found.last_name = "Last name is required";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const updated = await authApi.updateMe({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
      });
      setUser(updated); // updates the header avatar and greeting immediately
      setStatus({ severity: "success", message: "Your name has been updated." });
    } catch (error) {
      setStatus({ severity: "error", message: error.message });
      if (error.details) setErrors(error.details);
    } finally {
      setSaving(false);
    }
  };

  const contactNote =
    user.role === "admin"
      ? "Admins can change email, role, and job title from the Users page."
      : user.role === "manager"
        ? "Ask an admin to change your email, role, or job title."
        : "Ask your manager or an admin to change your email, role, or job title.";

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Your details
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            {status && (
              <Alert severity={status.severity} role={status.severity === "error" ? "alert" : "status"}>
                {status.message}
              </Alert>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="First name" required fullWidth value={form.first_name}
                onChange={handleChange("first_name")} error={Boolean(errors.first_name)}
                helperText={errors.first_name} disabled={saving}
              />
              <TextField
                label="Last name" required fullWidth value={form.last_name}
                onChange={handleChange("last_name")} error={Boolean(errors.last_name)}
                helperText={errors.last_name} disabled={saving}
              />
            </Stack>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <ReadOnlyField label="Username" value={user.username} />
              <ReadOnlyField label="Email" value={user.email} />
              <ReadOnlyField label="Role" value={ROLE_LABELS[user.role]} />
              <ReadOnlyField label="Job title" value={user.job_title} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {contactNote}
            </Typography>
            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !changed}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
              >
                Save name
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

function PasswordCard() {
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setStatus(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!form.current) found.current = "Enter your current password";
    if (form.next.length < 8 || !/[a-zA-Z]/.test(form.next) || !/\d/.test(form.next)) {
      found.next = "At least 8 characters, with a letter and a number";
    }
    if (form.confirm !== form.next) found.confirm = "Passwords don't match";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await authApi.changePassword(form.current, form.next);
      setForm(EMPTY_PASSWORDS);
      setStatus({ severity: "success", message: "Your password has been changed." });
    } catch (error) {
      setStatus({ severity: "error", message: error.message });
      // Map backend field names to this form's field names
      setErrors({
        current: error.details?.current_password,
        next: error.details?.new_password,
      });
    } finally {
      setSaving(false);
    }
  };

  const passwordField = (field, label, autoComplete, helper) => (
    <TextField
      label={label}
      type="password"
      required
      fullWidth
      autoComplete={autoComplete}
      value={form[field]}
      onChange={handleChange(field)}
      error={Boolean(errors[field])}
      helperText={errors[field] || helper}
      disabled={saving}
    />
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Change password
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            {status && (
              <Alert severity={status.severity} role={status.severity === "error" ? "alert" : "status"}>
                {status.message}
              </Alert>
            )}
            {passwordField("current", "Current password", "current-password")}
            {passwordField("next", "New password", "new-password", "At least 8 characters, with a letter and a number")}
            {passwordField("confirm", "Confirm new password", "new-password")}
            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
              >
                Change password
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="My profile" subtitle="Update your name and password" />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, alignItems: "start" }}>
        <NameCard />
        <PasswordCard />
      </Box>
    </>
  );
}
