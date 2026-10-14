import { useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import { costsApi } from "../../services/endpoints";
import { todayIso } from "../../utils/assignments";
import { COST_CATEGORY_LABELS } from "../../utils/format";

function validate(form) {
  const errors = {};
  if (!form.category) errors.category = "Choose a category";
  if (!form.description.trim()) errors.description = "Description is required";
  const amount = Number(form.amount);
  if (form.amount === "" || Number.isNaN(amount) || amount <= 0) errors.amount = "Enter an amount greater than 0";
  if (!form.cost_date) errors.cost_date = "Date is required";
  return errors;
}

export default function CostFormDialog({ project, cost, onClose, onSaved }) {
  const isEdit = Boolean(cost);
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [form, setForm] = useState(() => ({
    category: cost?.category || "technology",
    description: cost?.description || "",
    amount: cost ? String(cost.amount) : "",
    cost_date: cost?.cost_date || todayIso(),
  }));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      cost_date: form.cost_date,
    };
    setSaving(true);
    setSubmitError("");
    try {
      const saved = isEdit
        ? await costsApi.update(project.id, cost.id, payload)
        : await costsApi.create(project.id, payload);
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
        <DialogTitle>{isEdit ? "Edit cost" : "Add cost"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            <TextField select label="Category" required {...fieldProps("category")}>
              {Object.entries(COST_CATEGORY_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description"
              placeholder="e.g. Migration servers"
              required
              autoFocus
              {...fieldProps("description")}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Amount (USD)"
                type="number"
                required
                slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                {...fieldProps("amount")}
              />
              <TextField
                label="Date"
                type="date"
                required
                slotProps={{ inputLabel: { shrink: true } }}
                {...fieldProps("cost_date")}
                helperText={errors.cost_date || "Future dates count as upcoming, not yet spent"}
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
            {isEdit ? "Save changes" : "Add cost"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
