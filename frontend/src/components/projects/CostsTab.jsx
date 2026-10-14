import { useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import useApiData from "../../hooks/useApiData";
import { costsApi } from "../../services/endpoints";
import { todayIso } from "../../utils/assignments";
import { COST_CATEGORY_LABELS, formatCurrency, formatDate } from "../../utils/format";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import LoadingState from "../LoadingState";
import CostFormDialog from "./CostFormDialog";

function Figure({ label, value, hint }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="p">
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export default function CostsTab({ project, canManage, onChanged, onNotice }) {
  const { data: costs, loading, error, reload } = useApiData(() => costsApi.list(project.id), [project.id]);
  const [formFor, setFormFor] = useState(null); // null = closed, {} = new, {cost} = edit
  const [deleting, setDeleting] = useState(null);
  const today = todayIso();

  const refreshAll = () => {
    reload();
    onChanged();
  };

  if (loading && !costs) return <LoadingState message="Loading costs..." />;
  if (error && !costs) return <ErrorState error={error} onRetry={reload} />;

  const upcoming = Number(project.other_costs_total) - Number(project.other_costs_spent);

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
            <Figure label="Labor spent" value={formatCurrency(project.labor_spent)} hint="Hours worked × rates" />
            <Figure label="Other costs spent" value={formatCurrency(project.other_costs_spent)} hint="Dated today or earlier" />
            <Figure label="Upcoming costs" value={formatCurrency(upcoming)} hint="Dated in the future" />
            <Figure label="Budget remaining" value={formatCurrency(project.budget_remaining)} hint={`of ${formatCurrency(project.budget)}`} />
          </Box>
        </CardContent>
      </Card>

      {canManage && (
        <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormFor({})}>
            Add cost
          </Button>
        </Box>
      )}

      {costs.length === 0 ? (
        <EmptyState
          icon={<AttachMoneyIcon fontSize="inherit" />}
          title="No other costs yet"
          message="Track non-labor spending such as hardware, software licenses, services, and travel."
        />
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Project costs" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Added by</TableCell>
                  {canManage && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(cost.cost_date)}
                      {cost.cost_date > today && <Chip size="small" label="Upcoming" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={COST_CATEGORY_LABELS[cost.category] || cost.category} />
                    </TableCell>
                    <TableCell>{cost.description}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrency(cost.amount)}
                    </TableCell>
                    <TableCell>{cost.created_by_name}</TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <Tooltip title="Edit cost">
                            <IconButton aria-label={`Edit ${cost.description}`} onClick={() => setFormFor({ cost })}>
                              <EditOutlinedIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete cost">
                            <IconButton aria-label={`Delete ${cost.description}`} color="error" onClick={() => setDeleting(cost)}>
                              <DeleteOutlinedIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {formFor && (
        <CostFormDialog
          project={project}
          cost={formFor.cost}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            onNotice(formFor.cost ? "Cost updated" : "Cost added");
            setFormFor(null);
            refreshAll();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title="Delete this cost?"
          message={`"${deleting.description}" (${formatCurrency(deleting.amount)}) will be removed from the budget. The audit log keeps a record of it.`}
          confirmLabel="Delete"
          confirmColor="error"
          onConfirm={async () => {
            await costsApi.remove(project.id, deleting.id);
            onNotice("Cost deleted");
            refreshAll();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
