import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/auth-context";
import LoginPage from "./LoginPage";

function renderLogin(auth = {}) {
  const value = { user: null, sessionExpired: false, login: vi.fn(), ...auth };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return value;
}

const signIn = () => fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

describe("LoginPage", () => {
  it("shows field errors and does not call the server when fields are empty", () => {
    const auth = renderLogin();
    signIn();
    expect(screen.getByText("Username is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("sends the trimmed username and the password", () => {
    const auth = renderLogin({ login: vi.fn().mockResolvedValue({ id: 1 }) });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "  admin1 " } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "Secret123" } });
    signIn();
    expect(auth.login).toHaveBeenCalledWith("admin1", "Secret123");
  });

  it("shows the server's error message when login fails", async () => {
    renderLogin({ login: vi.fn().mockRejectedValue(new Error("Invalid username or password")) });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin1" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
  });

  it("explains when a session has expired", () => {
    renderLogin({ sessionExpired: true });
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
  });
});
