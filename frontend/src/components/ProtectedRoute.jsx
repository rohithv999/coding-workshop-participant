import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "../context/auth-context";

/**
 * Wrap routes that need a logged-in user.
 *   <ProtectedRoute />                       -> any logged-in user
 *   <ProtectedRoute roles={["admin"]} />     -> admins only
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <CircularProgress aria-label="Loading your session" />
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children ?? <Outlet />;
}
