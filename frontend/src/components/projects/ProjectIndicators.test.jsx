import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProjectCard from "./ProjectCard";
import { BudgetBar, MilestoneProgress, ProjectStatusChip, RiskChips } from "./ProjectIndicators";

const baseProject = {
  id: 3,
  name: "Server Decommission",
  manager_name: "Maria Lopez",
  start_date: "2026-10-01",
  end_date: "2026-12-31",
  status: "active",
  is_archived: false,
  is_overdue: false,
  is_over_budget: false,
  milestones_total: 2,
  milestones_complete: 1,
  progress_percent: 50,
  budget: 60000,
  budget_spent: 3000,
  team_size: 1,
  planned_hours: 132,
  worked_hours: 60,
};

describe("ProjectStatusChip", () => {
  it.each([
    [{}, "Active"],
    [{ status: "done" }, "Done"],
    [{ status: "done", is_archived: true }, "Archived"],
  ])("labels %o as %s", (changes, label) => {
    render(<ProjectStatusChip project={{ ...baseProject, ...changes }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("RiskChips", () => {
  it("flags overdue and over-budget projects", () => {
    render(<RiskChips project={{ ...baseProject, is_overdue: true, is_over_budget: true }} />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Over budget")).toBeInTheDocument();
  });

  it("shows nothing for healthy projects", () => {
    const { container } = render(<RiskChips project={baseProject} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("progress bars", () => {
  it("shows milestone progress as text, not only as a bar", () => {
    render(<MilestoneProgress project={baseProject} />);
    expect(screen.getByText("1 of 2 milestones")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("handles projects with no milestones", () => {
    render(<MilestoneProgress project={{ ...baseProject, milestones_total: 0, progress_percent: 0 }} />);
    expect(screen.getByText("No milestones yet")).toBeInTheDocument();
  });

  it("shows budget spent against the total", () => {
    render(<BudgetBar project={baseProject} />);
    expect(screen.getByText("$3,000 of $60,000 spent")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
  });
});

describe("ProjectCard", () => {
  const renderCard = (project) =>
    render(
      <MemoryRouter>
        <ProjectCard project={project} />
      </MemoryRouter>,
    );

  it("links to the project and shows its budget", () => {
    renderCard(baseProject);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/projects/3");
    expect(screen.getByText(/of \$60,000 spent/)).toBeInTheDocument();
  });

  it("hides the budget for employees (the API sends no budget fields)", () => {
    const { budget, budget_spent, ...employeeView } = baseProject; // eslint-disable-line no-unused-vars
    renderCard(employeeView);
    expect(screen.queryByText(/spent/)).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 milestones")).toBeInTheDocument();
  });
});
