import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext } from "../context/auth-context";
import ProtectedRoute from "./ProtectedRoute";

function renderAt(auth, roles) {
  render(
    <AuthContext.Provider value={{ user: null, loading: false, ...auth }}>
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/" element={<p>Home page</p>} />
          <Route element={<ProtectedRoute roles={roles} />}>
            <Route path="/secret" element={<p>Secret page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a spinner while the saved session is being restored", () => {
    renderAt({ loading: true });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
  });

  it("sends logged-out visitors to the login page", () => {
    renderAt({ user: null });
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("sends users without the right role back home", () => {
    renderAt({ user: { id: 3, role: "employee" } }, ["admin"]);
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("shows the page to users with an allowed role", () => {
    renderAt({ user: { id: 1, role: "admin" } }, ["admin", "manager"]);
    expect(screen.getByText("Secret page")).toBeInTheDocument();
  });
});
