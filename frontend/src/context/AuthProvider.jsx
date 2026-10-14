import { useCallback, useEffect, useMemo, useState } from "react";
import { setSessionExpiredHandler, tokenStore } from "../services/api";
import { authApi } from "../services/endpoints";
import { AuthContext } from "./auth-context";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only show a loading state if there's a saved session to restore
  const [loading, setLoading] = useState(Boolean(tokenStore.access));
  const [sessionExpired, setSessionExpired] = useState(false);

  // If the API client can't renew a session, log out and tell the login page why
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
    });
  }, []);

  // On page load, restore the session from a saved token
  useEffect(() => {
    if (!tokenStore.access) return;
    authApi
      .me()
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const loggedInUser = await authApi.login(username, password);
    setSessionExpired(false);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      loading,
      sessionExpired,
      login,
      logout,
      isAdmin: user?.role === "admin",
      isManager: user?.role === "manager",
      isEmployee: user?.role === "employee",
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}