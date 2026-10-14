import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useMediaQuery } from "react-responsive";
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, InputAdornment, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { auditApi } from "../services/endpoints";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import { ACTION_COLORS, ACTION_LABELS, describeChanges, ENTITY_LABELS } from "../utils/audit";
import { formatDateTime, ROLE_LABELS } from "../utils/format";

const PAGE_SIZE = 50;

function ActionChip({ action }) {
  return <Chip size="small" label={ACTION_LABELS[action] || action} color={ACTION_COLORS[action] || "default"} />;
}

function Actor({ entry }) {
  return (
    <>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {entry.actor_name}
      </Typography>
      {entry.actor_role && (
        <Typography variant="caption" color="text.secondary">
          {ROLE_LABELS[entry.actor_role]}
        </Typography>
      )}
    </>
  );
}

function Item({ entry }) {
  const label = entry.entity_label || `#${entry.entity_id}`;
  const linkable = entry.project_id && entry.entity_type !== "user";
  return (
    <>
      <Typography variant="caption" color="text.secondary" component="div">
        {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
      </Typography>
      {linkable ? (
        <Link component={RouterLink} to={`/projects/${entry.project_id}`} variant="body2">
          {label}
        </Link>
      ) : (
        <Typography variant="body2">{label}</Typography>
      )}
    </>
  );
}

function Changes({ entry }) {
  const lines = describeChanges(entry.changes);
  if (!lines.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {lines.map((line) => (
        <Typography component="li" variant="body2" key={line}>
          {line}
        </Typography>
      ))}
    </Box>
  );
}

export default function AuditLogPage() {
  const isMobile = useMediaQuery({ maxWidth: 899 });
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const [state, setState] = useState({ items: [], cursor: null, loading: true, loadingMore: false, error: null });
  const latestRequest = useRef(0);

  const filters = useMemo(
    () => ({ search: debouncedSearch, entity_type: entityType, action }),
    [debouncedSearch, entityType, action],
  );

  // before = undefined -> first page (replace); before = cursor -> next page (append)
  const fetchPage = useCallback(
    async (before) => {
      const requestId = ++latestRequest.current;
      setState((prev) => ({ ...prev, loading: !before, loadingMore: Boolean(before), error: null }));
      try {
        const data = await auditApi.list({ ...filters, before, limit: PAGE_SIZE });
        if (requestId !== latestRequest.current) return;
        setState((prev) => ({
          items: before ? [...prev.items, ...data.items] : data.items,
          cursor: data.next_cursor,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (error) {
        if (requestId === latestRequest.current) {
          setState((prev) => ({ ...prev, loading: false, loadingMore: false, error }));
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const { items, cursor, loading, loadingMore, error } = state;
  const hasFilters = Boolean(debouncedSearch || entityType || action);

  let content;
  if (loading) {
    content = <LoadingState message="Loading audit log..." />;
  } else if (error && !items.length) {
    content = <ErrorState error={error} onRetry={() => fetchPage()} />;
  } else if (!items.length) {
    content = (
      <EmptyState
        icon={<HistoryIcon fontSize="inherit" />}
        title={hasFilters ? "No matching entries" : "No activity yet"}
        message={hasFilters ? "Try different filters." : "Changes to users and projects will appear here."}
      />
    );
  } else if (isMobile) {
    content = (
      <Stack spacing={1.5}>
        {items.map((entry) => (
          <Card key={entry.id}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <ActionChip action={entry.action} />
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(entry.created_at)}
                </Typography>
              </Stack>
              <Item entry={entry} />
              <Box sx={{ my: 1 }}>
                <Changes entry={entry} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                By {entry.actor_name}
                {entry.actor_role ? ` (${ROLE_LABELS[entry.actor_role]})` : ""}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  } else {
    content = (
      <Card>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Audit log">
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: "nowrap" }}>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Changes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id} hover sx={{ verticalAlign: "top" }}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(entry.created_at)}</TableCell>
                  <TableCell>
                    <Actor entry={entry} />
                  </TableCell>
                  <TableCell>
                    <ActionChip action={entry.action} />
                  </TableCell>
                  <TableCell>
                    <Item entry={entry} />
                  </TableCell>
                  <TableCell>
                    <Changes entry={entry} />
                  </TableCell>
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
      <PageHeader title="Audit log" subtitle="Every change to users, projects, assignments, and milestones" />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Search"
          placeholder="Item or person"
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
        <TextField select label="Type" value={entityType} onChange={(e) => setEntityType(e.target.value)} sx={{ minWidth: { sm: 160 } }}>
          <MenuItem value="">All types</MenuItem>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Action" value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: { sm: 180 } }}>
          <MenuItem value="">All actions</MenuItem>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {content}

      {error && items.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <ErrorState error={error} onRetry={() => fetchPage(cursor)} />
        </Box>
      )}

      {cursor && !loading && (
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <Button
            variant="outlined"
            onClick={() => fetchPage(cursor)}
            disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {loadingMore ? "Loading..." : "Load older entries"}
          </Button>
        </Box>
      )}
    </>
  );
}
