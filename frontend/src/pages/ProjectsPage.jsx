import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, InputAdornment, LinearProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../context/auth-context";
import useApiData from "../hooks/useApiData";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { projectsApi } from "../services/endpoints";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import ProjectCard from "../components/projects/ProjectCard";
import ProjectFormDialog from "../components/projects/ProjectFormDialog";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
];

export default function ProjectsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim());

  const { data: projects, loading, error, reload } = useApiData(
    () => projectsApi.list({ search: debouncedSearch, status }),
    [debouncedSearch, status],
  );

  const hasFilters = Boolean(debouncedSearch || status);

  let content;
  if (loading && !projects) {
    content = <LoadingState message="Loading projects..." />;
  } else if (error && !projects) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (projects.length === 0) {
    content = hasFilters ? (
      <EmptyState
        title="No matching projects"
        message="Try a different search or status."
        action={
          <Button onClick={() => { setSearch(""); setStatus(""); }}>Clear filters</Button>
        }
      />
    ) : (
      <EmptyState
        title="No projects yet"
        message={isAdmin ? "Create the first project to get started." : "Projects you can access will appear here."}
      />
    );
  } else {
    content = (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Showing {projects.length} {projects.length === 1 ? "project" : "projects"}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
          }}
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </Box>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Search and filter projects"
        actions={
          isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Search"
          placeholder="Name or description"
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
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: { sm: 180 } }}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value || "all"} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* Thin bar while refreshing, so existing results stay visible */}
      <Box sx={{ height: 4, mb: 1 }}>{loading && projects && <LinearProgress />}</Box>

      {content}

      {creating && (
        <ProjectFormDialog
          onClose={() => setCreating(false)}
          onSaved={(project) => {
            setCreating(false);
            navigate(`/projects/${project.id}`);
          }}
        />
      )}
    </>
  );
}
