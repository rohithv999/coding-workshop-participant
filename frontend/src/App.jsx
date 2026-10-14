import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import EmptyState from "./components/EmptyState";
import PageHeader from "./components/PageHeader";
import ProtectedRoute from "./components/ProtectedRoute";
import ArchivePage from "./pages/ArchivePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ProjectsPage from "./pages/ProjectsPage";
import UsersPage from "./pages/UsersPage";

// Temporary placeholder - each one gets replaced by a real page in the next steps
function ComingSoon({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Coming soon" message={`The ${title} page is being built.`} />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Everything below requires a logged-in user and uses the app layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="profile" element={<ComingSoon title="My profile" />} />

          <Route element={<ProtectedRoute roles={["admin", "manager"]} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="archive" element={<ArchivePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
