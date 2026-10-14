import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, BASE_URL, setSessionExpiredHandler, tokenStore } from "./api";
import { authApi } from "./endpoints";

/** A minimal stand-in for a fetch Response. */
function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    json: async () => body,
  };
}

let fetchMock;
let onExpired;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  onExpired = vi.fn();
  setSessionExpiredHandler(onExpired);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const urlOf = (call) => String(call[0]);
const headersOf = (call) => call[1].headers;

describe("api client", () => {
  it("adds the login token and skips empty query values", async () => {
    tokenStore.save({ access_token: "abc" });
    fetchMock.mockResolvedValueOnce(reply(200, [{ id: 1 }]));

    const data = await api.get("/projects", { search: "net", status: "" });

    expect(data).toEqual([{ id: 1 }]);
    expect(urlOf(fetchMock.mock.calls[0])).toBe(`${BASE_URL}/projects?search=net`);
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe("Bearer abc");
  });

  it("refreshes an expired token and retries the request once", async () => {
    tokenStore.save({ access_token: "old", refresh_token: "r1" });
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: "Token has expired" }))
      .mockResolvedValueOnce(reply(200, { access_token: "new", refresh_token: "r2" }))
      .mockResolvedValueOnce(reply(200, { ok: true }));

    const data = await api.get("/auth/me");

    expect(data).toEqual({ ok: true });
    expect(urlOf(fetchMock.mock.calls[1])).toBe(`${BASE_URL}/auth/refresh`);
    expect(headersOf(fetchMock.mock.calls[2]).Authorization).toBe("Bearer new");
    expect(tokenStore.access).toBe("new");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("logs out when the session can't be renewed", async () => {
    tokenStore.save({ access_token: "old", refresh_token: "expired" });
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: "Token has expired" }))
      .mockResolvedValueOnce(reply(401, { error: "Token has expired" }))
      .mockResolvedValueOnce(reply(401, { error: "Token has expired" }));

    await expect(api.get("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.access).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("waits and retries once when the database is waking up (503)", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(reply(503, { error: "The database is starting up." }))
      .mockResolvedValueOnce(reply(200, { status: "ok" }));

    const pending = api.get("/health");
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one 503 retry", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(reply(503, { error: "The database is starting up." }));

    const pending = api.get("/health");
    const assertion = expect(pending).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns network failures into a friendly error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await api.get("/projects").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/Can't reach the server/);
  });

  it("passes the backend's message and field details through", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, { error: "Validation failed", details: { email: "is already in use" } }),
    );
    const error = await api.post("/users", {}).catch((e) => e);
    expect(error.message).toBe("Validation failed");
    expect(error.details).toEqual({ email: "is already in use" });
  });

  it("returns null for 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(reply(204));
    await expect(api.del("/projects/1")).resolves.toBeNull();
  });
});

describe("authApi.login", () => {
  it("saves both tokens on success", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { user: { id: 1 }, access_token: "a1", refresh_token: "r1" }),
    );
    const user = await authApi.login("admin1", "secret");
    expect(user).toEqual({ id: 1 });
    expect(tokenStore.access).toBe("a1");
    expect(tokenStore.refresh).toBe("r1");
  });

  it("does not try to refresh or log out on a wrong password", async () => {
    tokenStore.save({ refresh_token: "leftover" });
    fetchMock.mockResolvedValueOnce(reply(401, { error: "Invalid username or password" }));

    await expect(authApi.login("admin1", "wrong")).rejects.toThrow("Invalid username or password");
    expect(fetchMock).toHaveBeenCalledOnce(); // no refresh attempt
    expect(onExpired).not.toHaveBeenCalled();
  });
});
