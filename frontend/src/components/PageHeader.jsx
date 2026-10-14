import { Box, Stack, Typography } from "@mui/material";

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ mb: 3, justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
    >
      <Box>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
