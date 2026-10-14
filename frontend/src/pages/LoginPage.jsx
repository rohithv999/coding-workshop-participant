import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  Alert, Avatar, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useAuth } from "../context/auth-context";
import ColorModeToggle from "../components/ColorModeToggle";

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (or just logged in): go to where they were heading
  if (user) {
    return <Navigate to={location.state?.from || "/"} replace />;
  }

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!form.username.trim()) errors.username = "Username is required";
    if (!form.password) errors.password = "Password is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      await login(form.username.trim(), form.password);
    } catch (error) {
      setSubmitError(error.message);
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
      <Box sx={{ position: "fixed", top: 16, right: 16 }}>
        <ColorModeToggle color="default" />
      </Box>
      <Card sx={{ width: "100%", maxWidth: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={1} sx={{ mb: 3, alignItems: "center", textAlign: "center" }}>
            <Avatar sx={{ bgcolor: "primary.main" }}>
              <LockOutlinedIcon />
            </Avatar>
            <Typography variant="h5" component="h1">
              ACME Project Tracker
            </Typography>
            <Typography color="text.secondary">Sign in to continue</Typography>
          </Stack>

          {sessionExpired && !submitError && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your session expired. Please sign in again.
            </Alert>
          )}
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }} role="alert">
              {submitError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Username"
                value={form.username}
                onChange={handleChange("username")}
                error={Boolean(fieldErrors.username)}
                helperText={fieldErrors.username}
                autoComplete="username"
                autoFocus
                required
                fullWidth
                disabled={submitting}
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={handleChange("password")}
                error={Boolean(fieldErrors.password)}
                helperText={fieldErrors.password}
                autoComplete="current-password"
                required
                fullWidth
                disabled={submitting}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
              >
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
