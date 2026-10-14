import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, MenuItem, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import useApiData from "../hooks/useApiData";
import { projectsApi, usersApi } from "../services/endpoints";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import { formatDate, formatDateTime, fullName, ROLE_LABELS } from "../utils/format";

/**
 * Restore dialog shared by projects and users. Tries a plain restore first; if the backend
 * says an active manager is needed (409 with details.manager_id), it shows a manager picker.
 */
function RestoreDialog({ title, description, managerHelp, restore, onClose, onRestored }) {
  const [needManager, setNeedManager] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const managers = useApiData(
    () => (needManager ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [needManager],
  );

  const handleRestore = async () => {
    if (needManager && !managerId) {
      setError("Choose an active manager first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await restore(needManager ? Number(managerId) : undefined);
      onRestored();
    } catch (err) {
      if (err.status === 409 && err.details?.manager_id && !needManager) {
        setNeedManager(true);
      }
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity={needManager ? "warning" : "error"} sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        <DialogContentText sx={{ mb: needManager ? 2 : 0 }}>
          {needManager ? managerHelp : description}
        </DialogContentText>
        {needManager && (
          <TextField
            select
            fullWidth
            label="New manager"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={busy}
          >
            {managers.loading && <MenuItem disabled>Loading managers...</MenuItem>}
            {(managers.data || []).map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {fullName(m)} ({m.username})
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleRestore}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <RestoreIcon />}
        >
          Restore
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ArchivedList({ items, loading, error, reload, emptyTitle, renderItem }) {
  if (loading && !items) return <LoadingState message="Loading archive..." />;
  if (error && !items) return <ErrorState error={error} onRetry={reload} />;
  if (items.length === 0) {
    return <EmptyState icon={<ArchiveOutlinedIcon fontSize="inherit" />} title={emptyTitle} />;
  }
  return <Stack spacing={1.5}>{items.map(renderItem)}</Stack>;
}

export default function ArchivePage() {
  const [tab, setTab] = useState("projects");
  const [restoring, setRestoring] = useState(null); // { kind: "project" | "user", item }
  const [notice, setNotice] = useState("");
  const projects = useApiData(() => projectsApi.list({ archived: "true" }), []);
  const users = useApiData(() => usersApi.list({ status: "archived" }), []);

  const rowLayout = {
    direction: { xs: "column", sm: "row" },
    spacing: 2,
    sx: { justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } },
  };

  return (
    <>
      <PageHeader title="Archive" subtitle="Archived projects and users. Only admins can see this page." />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="projects" label={`Projects${projects.data ? ` (${projects.data.length})` : ""}`} />
        <Tab value="users" label={`Users${users.data ? ` (${users.data.length})` : ""}`} />
      </Tabs>

      {tab === "projects" && (
        <ArchivedList
          {...projects}
          items={projects.data}
          emptyTitle="No archived projects"
          renderItem={(p) => (
            <Card key={p.id}>
              <CardContent>
                <Stack {...rowLayout}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      <Chip size="small" label={p.status === "done" ? "Done" : "Active"} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {p.manager_name} · {formatDate(p.start_date)} – {formatDate(p.end_date)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Archived {formatDateTime(p.archived_at)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button component={RouterLink} to={`/projects/${p.id}`}>
                      View
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<RestoreIcon />}
                      onClick={() => setRestoring({ kind: "project", item: p })}
                    >
                      Restore
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}
        />
      )}

      {tab === "users" && (
        <ArchivedList
          {...users}
          items={users.data}
          emptyTitle="No archived users"
          renderItem={(u) => (
            <Card key={u.id}>
              <CardContent>
                <Stack {...rowLayout}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography sx={{ fontWeight: 600 }}>{fullName(u)}</Typography>
                      <Chip size="small" label={ROLE_LABELS[u.role]} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {u.username} · {u.email}
                      {u.job_title ? ` · ${u.job_title}` : ""}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<RestoreIcon />}
                    onClick={() => setRestoring({ kind: "user", item: u })}
                    sx={{ flexShrink: 0 }}
                  >
                    Restore
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}
        />
      )}

      {restoring?.kind === "project" && (
        <RestoreDialog
          title={`Restore "${restoring.item.name}"?`}
          description="The project will become visible to its manager and team again."
          managerHelp="This project's manager is no longer active. Choose a new manager to restore it."
          restore={(managerId) => projectsApi.unarchive(restoring.item.id, managerId)}
          onClose={() => setRestoring(null)}
          onRestored={() => {
            setNotice(`"${restoring.item.name}" restored`);
            setRestoring(null);
            projects.reload();
          }}
        />
      )}

      {restoring?.kind === "user" && (
        <RestoreDialog
          title={`Restore ${fullName(restoring.item)}?`}
          description="They'll be able to sign in again with their existing username and password."
          managerHelp="This employee's manager is no longer active. Choose a new manager to restore them."
          restore={async (managerId) => {
            if (managerId) await usersApi.update(restoring.item.id, { manager_id: managerId });
            await usersApi.unarchive(restoring.item.id);
          }}
          onClose={() => setRestoring(null)}
          onRestored={() => {
            setNotice(`${fullName(restoring.item)} restored`);
            setRestoring(null);
            users.reload();
          }}
        />
      )}

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={3000}
        onClose={() => setNotice("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
