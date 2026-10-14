import { useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
} from "@mui/material";

/**
 * "Are you sure?" dialog. onConfirm may be async; errors are shown inside the dialog.
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", confirmColor = "primary", onConfirm, onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClose = () => {
    if (busy) return;
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={confirmColor}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
