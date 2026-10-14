import { useState } from "react";
import {
  Box, Button, Card, CardContent, FormControlLabel, IconButton, LinearProgress, MenuItem, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAuth } from "../context/auth-context";
import useApiData from "../hooks/useApiData";
import { usersApi, workloadApi } from "../services/endpoints";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import PageHeader from "../components/PageHeader";
import { formatDate, formatNumber, fullName } from "../utils/format";

const WEEK_OPTIONS = [4, 6, 8, 12];

// ---------- date helpers (local time, "YYYY-MM-DD") ----------
function toIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
function thisMonday() {
  const now = new Date();
  now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return toIso(now);
}
function shiftWeeks(iso, count) {
  const [y, m, d] = iso.split("-").map(Number);
  return toIso(new Date(y, m - 1, d + count * 7));
}
function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- utilization colors ----------
function cellTone(week) {
  if (week.over_allocated) return "error";
  if (Number(week.hours) === 0) return null;
  if (week.utilization >= 100) return "primary";
  if (week.utilization >= 75) return "warning";
  return "success";
}

function WeekCell({ week }) {
  const tone = cellTone(week);
  const tip = week.over_allocated
    ? `Over-allocated: busiest day is ${formatNumber(week.peak_day_hours)}h (limit 8h)`
    : `${formatNumber(week.hours)} of ${week.capacity} hours · busiest day ${formatNumber(week.peak_day_hours)}h`;
  return (
    <Tooltip title={tip} arrow>
      <Box
        tabIndex={0}
        aria-label={tip}
        sx={(theme) => ({
          px: 1,
          py: 0.75,
          borderRadius: 1.5,
          textAlign: "center",
          minWidth: 72,
          bgcolor: tone ? alpha(theme.palette[tone].main, 0.16) : theme.palette.action.hover,
          color: tone ? theme.palette[tone].main : theme.palette.text.secondary,
          fontWeight: week.over_allocated ? 700 : 500,
          outline: week.over_allocated ? `2px solid ${theme.palette.error.main}` : "none",
        })}
      >
        <Typography variant="body2" sx={{ fontWeight: "inherit" }}>
          {formatNumber(week.hours)}h
        </Typography>
        <Typography variant="caption" sx={{ display: "block", opacity: 0.85 }}>
          {week.utilization}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h5" component="p" sx={{ color }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

function Legend() {
  const items = [
    ["Nothing booked", null],
    ["Under 75%", "success"],
    ["75–99%", "warning"],
    ["Full (100%)", "primary"],
    ["Over-allocated", "error"],
  ];
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, mt: 2 }}>
      {items.map(([label, tone]) => (
        <Stack key={label} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Box
            sx={(theme) => ({
              width: 14,
              height: 14,
              borderRadius: 0.5,
              bgcolor: tone ? alpha(theme.palette[tone].main, 0.35) : theme.palette.action.hover,
            })}
          />
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export default function WorkloadPage() {
  const { isAdmin } = useAuth();
  const [start, setStart] = useState(thisMonday);
  const [weeks, setWeeks] = useState(6);
  const [team, setTeam] = useState(""); // "" = everyone, "me" = my team, or a manager id

  const { data, loading, error, reload } = useApiData(
    () => workloadApi.get({ start, weeks, manager_id: team }),
    [start, weeks, team],
  );
  const managers = useApiData(
    () => (isAdmin ? usersApi.list({ role: "manager" }) : Promise.resolve([])),
    [isAdmin],
  );

  const employees = data?.employees || [];
  const overAllocated = employees.filter((e) => e.over_allocated).length;
  const atCapacity = employees.filter((e) => e.weeks.some((w) => w.utilization >= 90)).length;
  const freeHours = employees.reduce((sum, e) => sum + Math.max(e.total_capacity - Number(e.total_hours), 0), 0);

  let content;
  if (loading && !data) {
    content = <LoadingState message="Calculating workload..." />;
  } else if (error && !data) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (employees.length === 0) {
    content = <EmptyState title="No employees to show" message="Try a different team filter." />;
  } else {
    content = (
      <Card>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Weekly workload by employee">
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: "sticky", left: 0, zIndex: 2, bgcolor: "background.paper", minWidth: 170 }}>
                  Employee
                </TableCell>
                {data.weeks.map((week) => (
                  <TableCell key={week} align="center" sx={{ whiteSpace: "nowrap" }}>
                    Week of {shortDate(week)}
                  </TableCell>
                ))}
                <TableCell align="center">Overall</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id} hover>
                  <TableCell sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper" }}>
                    <Tooltip
                      arrow
                      title={
                        employee.assignments.length
                          ? employee.assignments
                              .map((a) => `${a.project_name}: ${formatNumber(a.hours_per_day)}h/day (${formatDate(a.start_date)} – ${formatDate(a.end_date)})`)
                              .join(" · ")
                          : "No active assignments in this range"
                      }
                    >
                      <Box tabIndex={0}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {fullName(employee)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {employee.job_title || employee.username} · {employee.assignments.length}{" "}
                          {employee.assignments.length === 1 ? "project" : "projects"}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                  {employee.weeks.map((week) => (
                    <TableCell key={week.week_start} align="center">
                      <WeekCell week={week} />
                    </TableCell>
                  ))}
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 600, color: employee.over_allocated ? "error.main" : "text.primary" }}>
                      {employee.utilization}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(employee.total_hours)} / {employee.total_capacity}h
                    </Typography>
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
      <PageHeader title="Team workload" subtitle="Booked hours per week, based on assignments to active projects" />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2, alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton aria-label="Previous weeks" onClick={() => setStart((s) => shiftWeeks(s, -weeks))}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 600, minWidth: 190, textAlign: "center" }}>
            {data ? `${shortDate(data.start)} – ${formatDate(data.end)}` : "…"}
          </Typography>
          <IconButton aria-label="Next weeks" onClick={() => setStart((s) => shiftWeeks(s, weeks))}>
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" onClick={() => setStart(thisMonday())}>
            This week
          </Button>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <TextField select size="small" label="Weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} sx={{ minWidth: 110 }}>
            {WEEK_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>
                {n} weeks
              </MenuItem>
            ))}
          </TextField>
          {isAdmin ? (
            <TextField select size="small" label="Team" value={team} onChange={(e) => setTeam(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">All employees</MenuItem>
              {(managers.data || []).map((m) => (
                <MenuItem key={m.id} value={String(m.id)}>
                  {fullName(m)}&apos;s team
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <FormControlLabel
              control={<Switch checked={team === "me"} onChange={(e) => setTeam(e.target.checked ? "me" : "")} />}
              label="My team only"
            />
          )}
        </Stack>
      </Stack>

      {data && (
        <Box sx={{ display: "grid", gap: 2, mb: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
          <SummaryCard label="Employees" value={employees.length} />
          <SummaryCard label="Over-allocated" value={overAllocated} color={overAllocated ? "error.main" : undefined} />
          <SummaryCard label="At capacity (90%+ in a week)" value={atCapacity} color={atCapacity ? "warning.main" : undefined} />
          <SummaryCard label="Free hours in range" value={formatNumber(freeHours)} color="success.main" />
        </Box>
      )}

      <Box sx={{ height: 4, mb: 1 }}>{loading && data && <LinearProgress />}</Box>
      {content}
      {data && employees.length > 0 && <Legend />}
    </>
  );
}
