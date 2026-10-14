import { Link as RouterLink } from "react-router-dom";
import { Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import { BudgetBar, MilestoneProgress, ProjectStatusChip, RiskChips } from "./ProjectIndicators";
import { formatDate, formatNumber } from "../../utils/format";

export default function ProjectCard({ project }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardActionArea component={RouterLink} to={`/projects/${project.id}`} sx={{ height: "100%" }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <Typography variant="h6" component="h2" sx={{ lineHeight: 1.3 }}>
                {project.name}
              </Typography>
              <ProjectStatusChip project={project} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {project.manager_name} · {formatDate(project.start_date)} – {formatDate(project.end_date)}
            </Typography>
            <RiskChips project={project} />
            <MilestoneProgress project={project} />
            {project.budget !== undefined && <BudgetBar project={project} />}
            <Typography variant="body2" color="text.secondary">
              {project.team_size} {project.team_size === 1 ? "person" : "people"} ·{" "}
              {formatNumber(project.worked_hours)} of {formatNumber(project.planned_hours)} hours worked
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
