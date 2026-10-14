import { Box, Typography } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

export default function EmptyState({ title = "Nothing here yet", message, action, icon }) {
  return (
    <Box sx={{ py: 6, px: 2, textAlign: "center", color: "text.secondary" }}>
      <Box sx={{ fontSize: 48, mb: 1, color: "action.disabled" }}>
        {icon || <InboxOutlinedIcon fontSize="inherit" />}
      </Box>
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {message && <Typography sx={{ mt: 0.5 }}>{message}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
