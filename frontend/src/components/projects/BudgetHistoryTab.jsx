import {
  Card, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import useApiData from "../../hooks/useApiData";
import { projectsApi } from "../../services/endpoints";
import { formatCurrency, formatDateTime } from "../../utils/format";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import LoadingState from "../LoadingState";

function Difference({ oldAmount, newAmount }) {
  const diff = Number(newAmount) - Number(oldAmount);
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return (
    <Chip
      size="small"
      label={`${sign}${formatCurrency(Math.abs(diff))}`}
      color={diff > 0 ? "success" : diff < 0 ? "warning" : "default"}
      variant="outlined"
    />
  );
}

export default function BudgetHistoryTab({ project }) {
  // Reload whenever the budget changes, so a new edit shows up immediately
  const { data: history, loading, error, reload } = useApiData(
    () => projectsApi.budgetHistory(project.id),
    [project.id, project.budget],
  );

  if (loading && !history) return <LoadingState message="Loading budget history..." />;
  if (error && !history) return <ErrorState error={error} onRetry={reload} />;

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon fontSize="inherit" />}
        title="No budget changes yet"
        message={`The budget has stayed at ${formatCurrency(project.budget)} since the project was created.`}
      />
    );
  }

  return (
    <>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Current budget: <strong>{formatCurrency(project.budget)}</strong> · {history.length}{" "}
        {history.length === 1 ? "change" : "changes"}
      </Typography>
      <Card>
        {/* Wide tables scroll inside their own box on small screens */}
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Budget change history" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Changed by</TableCell>
                <TableCell align="right">From</TableCell>
                <TableCell align="right">To</TableCell>
                <TableCell align="center">Change</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(entry.changed_at)}</TableCell>
                  <TableCell>{entry.changed_by_name}</TableCell>
                  <TableCell align="right">{formatCurrency(entry.old_amount)}</TableCell>
                  <TableCell align="right">{formatCurrency(entry.new_amount)}</TableCell>
                  <TableCell align="center">
                    <Difference oldAmount={entry.old_amount} newAmount={entry.new_amount} />
                  </TableCell>
                  <TableCell sx={{ color: entry.reason ? "text.primary" : "text.secondary" }}>
                    {entry.reason || "No reason given"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
}
