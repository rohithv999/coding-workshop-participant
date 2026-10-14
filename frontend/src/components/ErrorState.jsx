import { Alert, Button } from "@mui/material";

export default function ErrorState({ error, onRetry }) {
  return (
    <Alert
      severity="error"
      role="alert"
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {error?.message || "Something went wrong."}
    </Alert>
  );
}
