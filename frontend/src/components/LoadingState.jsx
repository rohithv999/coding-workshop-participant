import { Box, CircularProgress, Typography } from "@mui/material";

export default function LoadingState({ message = "Loading..." }) {
  return (
    <Box role="status" sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <CircularProgress />
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}
