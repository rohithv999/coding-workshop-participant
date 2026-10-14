import { useMemo, useState } from "react";
import { useMediaQuery } from "react-responsive";
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, LinearProgress, MenuItem, Snackbar, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useAuth } from "../context/auth-context";
import useApiData from "../hooks/useApiData";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { usersApi } from "../services/endpoints";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import UserFormDialog from "../components/users/UserFormDialog";
import { formatCurrency, fullName, ROLE_LABELS } from "../utils/format";

const ROLE_COLORS = { admin: "primary", manager: "secondary", employee: "default" };

function RoleChip({ role }) {
  return <Chip size="small" label={ROLE_LABELS[role]} color={ROLE_COLORS[role]} />;
}

function CreatedUserDialog({ user, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.username);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>User created</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>Share these sign-in details with {fullName(user)}:</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Username:
          </Typography>
          <Typography variant="h6" component="p" sx={{ fontFamily: "monospace" }}>
            {user.username}
          </Typography>
          <Tooltip title={copied ? "Copied!" : "Copy username"}>
            <IconButton size="small" onClick={copy} aria-label="Copy username">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Password: the initial password you set. They can change it from My profile after signing in.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: me, isAdmin } = useAuth();
  const isMobile = useMediaQuery({ maxWidth: 899 });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [teamOnly, setTeamOnly] = useState(false);
  const [formFor, setFormFor] = useState(null); // null = closed, {} = new, {user} = edit
  const [archiving, setArchiving] = useState(null);
  const [created, setCreated] = useState(null);
  const [notice, setNotice] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());

  const { data: users, loading, error, reload } = useApiData(
    () =>
      usersApi.list({
        search: debouncedSearch,
        role: isAdmin ? role : "",
        manager_id: !isAdmin && teamOnly ? "me" : "",
      }),
    [debouncedSearch, role, teamOnly, isAdmin],
  );
  // Manager names for the "Manager" column (admins can see all managers)
  const managers = useApiData(
    () => (isAdmin ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [isAdmin],
  );
  const managerNames = useMemo(
    () => Object.fromEntries((managers.data || []).map((m) => [m.id, fullName(m)])),
    [managers.data],
  );

  const managerLabel = (u) => {
    if (!u.manager_id) return "—";
    if (u.manager_id === me.id) return "You";
    return managerNames[u.manager_id] || "Another manager";
  };
  const canEdit = (u) => isAdmin || u.manager_id === me.id;
  const canArchive = (u) => isAdmin && u.id !== me.id;
  const refreshAll = () => {
    reload();
    managers.reload();
  };

  const actionsFor = (u) => (
    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
      {canEdit(u) && (
        <Tooltip title="Edit user">
          <IconButton aria-label={`Edit ${fullName(u)}`} onClick={() => setFormFor({ user: u })}>
            <EditOutlinedIcon />
          </IconButton>
        </Tooltip>
      )}
      {canArchive(u) && (
        <Tooltip title="Archive user">
          <IconButton aria-label={`Archive ${fullName(u)}`} color="error" onClick={() => setArchiving(u)}>
            <ArchiveOutlinedIcon />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );

  let content;
  if (loading && !users) {
    content = <LoadingState message="Loading users..." />;
  } else if (error && !users) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (users.length === 0) {
    content = <EmptyState title="No users found" message="Try a different search or filter." />;
  } else if (isMobile) {
    content = (
      <Stack spacing={1.5}>
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>{fullName(u)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {u.username} · {u.email}
                  </Typography>
                  <Typography variant="body2">{u.job_title || "No job title"}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                    <RoleChip role={u.role} />
                    {u.role === "employee" && (
                      <Typography variant="body2" color="text.secondary">
                        Manager: {managerLabel(u)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
                {actionsFor(u)}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  } else {
    content = (
      <Card>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Users">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Job title</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Manager</TableCell>
                {isAdmin && <TableCell align="right">Hourly rate</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{fullName(u)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                      {u.username}
                    </Typography>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.job_title || "—"}</TableCell>
                  <TableCell>
                    <RoleChip role={u.role} />
                  </TableCell>
                  <TableCell>{managerLabel(u)}</TableCell>
                  {isAdmin && <TableCell align="right">{formatCurrency(u.hourly_rate)}</TableCell>}
                  <TableCell align="right">{actionsFor(u)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={isAdmin ? "Manage admins, managers, and employees" : "Employees you can assign to projects"}
        actions={
          isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormFor({})}>
              New user
            </Button>
          )
        }
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2, alignItems: { sm: "center" } }}>
        <TextField
          label="Search"
          placeholder="Name, email, username, or job title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        {isAdmin ? (
          <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: { sm: 180 } }}>
            <MenuItem value="">All roles</MenuItem>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <FormControlLabel
            control={<Switch checked={teamOnly} onChange={(e) => setTeamOnly(e.target.checked)} />}
            label="My team only"
          />
        )}
      </Stack>

      <Box sx={{ height: 4, mb: 1 }}>{loading && users && <LinearProgress />}</Box>
      {content}

      {formFor && (
        <UserFormDialog
          user={formFor.user}
          onClose={() => setFormFor(null)}
          onSaved={(saved) => {
            setFormFor(null);
            if (formFor.user) setNotice("User updated");
            else setCreated(saved);
            refreshAll();
          }}
        />
      )}

      {created && <CreatedUserDialog user={created} onClose={() => setCreated(null)} />}

      {archiving && (
        <ConfirmDialog
          open
          title={`Archive ${fullName(archiving)}?`}
          message="They won't be able to sign in. Their history stays on past projects, and an admin can restore them from the Archive page."
          confirmLabel="Archive"
          confirmColor="error"
          onConfirm={async () => {
            try {
              await usersApi.archive(archiving.id);
            } catch (err) {
              const d = err.details;
              if (d?.active_projects !== undefined) {
                throw new Error(
                  `${err.message} (${d.active_projects} active ${d.active_projects === 1 ? "project" : "projects"}, ` +
                    `${d.active_employees} ${d.active_employees === 1 ? "employee" : "employees"}).`,
                );
              }
              throw err;
            }
            setNotice(`${fullName(archiving)} archived`);
            refreshAll();
          }}
          onClose={() => setArchiving(null)}
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
