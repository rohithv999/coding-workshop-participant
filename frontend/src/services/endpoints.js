// One named function per backend endpoint. Pages import from here, never build URLs themselves.
import { api, request, tokenStore } from "./api";

export const authApi = {
  async login(username, password) {
    // auth: false -> a wrong password must not trigger the token refresh/logout logic
    const data = await request("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
    tokenStore.save(data);
    return data.user;
  },
  me: () => api.get("/auth/me"),
  updateMe: (fields) => api.put("/auth/me", fields),
  changePassword: (currentPassword, newPassword) =>
    api.post("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  logout: () => tokenStore.clear(),
};

export const usersApi = {
  list: (filters) => api.get("/users", filters),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  archive: (id) => api.del(`/users/${id}`),
  unarchive: (id) => api.post(`/users/${id}/unarchive`),
};

export const projectsApi = {
  list: (filters) => api.get("/projects", filters),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post("/projects", data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  complete: (id) => api.post(`/projects/${id}/complete`),
  reopen: (id) => api.post(`/projects/${id}/reopen`),
  archive: (id) => api.del(`/projects/${id}`),
  unarchive: (id, managerId) =>
    api.post(`/projects/${id}/unarchive`, managerId ? { manager_id: managerId } : undefined),
  budgetHistory: (id) => api.get(`/projects/${id}/budget-history`),
};

export const assignmentsApi = {
  list: (projectId) => api.get(`/projects/${projectId}/assignments`),
  create: (projectId, data) => api.post(`/projects/${projectId}/assignments`, data),
  assignTeam: (projectId, data) => api.post(`/projects/${projectId}/assignments/team`, data),
  update: (projectId, assignmentId, data) =>
    api.put(`/projects/${projectId}/assignments/${assignmentId}`, data),
  remove: (projectId, assignmentId) =>
    api.del(`/projects/${projectId}/assignments/${assignmentId}`),
};

export const milestonesApi = {
  list: (projectId) => api.get(`/projects/${projectId}/milestones`),
  create: (projectId, data) => api.post(`/projects/${projectId}/milestones`, data),
  update: (projectId, milestoneId, data) =>
    api.put(`/projects/${projectId}/milestones/${milestoneId}`, data),
  remove: (projectId, milestoneId) =>
    api.del(`/projects/${projectId}/milestones/${milestoneId}`),
};
export const auditApi = {
  list: (filters) => api.get("/audit-log", filters),
};
