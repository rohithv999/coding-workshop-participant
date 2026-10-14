import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import EmptyState from "./components/EmptyState";
import PageHeader from "./components/PageHeader";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";

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
          <Route index element={<ComingSoon title="Dashboard" />} />
          <Route path="projects" element={<ComingSoon title="Projects" />} />
          <Route path="projects/:projectId" element={<ComingSoon title="Project details" />} />
          <Route path="profile" element={<ComingSoon title="My profile" />} />

          <Route element={<ProtectedRoute roles={["admin", "manager"]} />}>
            <Route path="users" element={<ComingSoon title="Users" />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="archive" element={<ComingSoon title="Archive" />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
