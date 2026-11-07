import axios from 'axios';

// Base URL comes from frontend/.env (VITE_API_BASE_URL). No secrets belong here.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  timeout: 15000,
});

// The login token lives in memory here; AuthContext also keeps a copy in sessionStorage.
let token = null;
let onUnauthorized = null;

export function setToken(value) {
  token = value;
}

// Called when the server says our token is no longer valid (expired, user disabled).
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && token && onUnauthorized) onUnauthorized();
    return Promise.reject(error);
  }
);

const unwrap = (promise) => promise.then((r) => r.data.data);

// ---- health (public) ----
export const getBackendHealth = () => unwrap(api.get('/api/health'));
export const getMlHealth = () => unwrap(api.get('/api/health/ml'));

// ---- auth ----
export const registerUser = (body) => unwrap(api.post('/api/auth/register', body));
export const loginUser = (body) => unwrap(api.post('/api/auth/login', body));
export const getMe = () => unwrap(api.get('/api/auth/me')).then((d) => d.user);

// ---- detection ----
export function uploadCsv(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  // Do not set Content-Type by hand: the browser adds the multipart boundary itself.
  return unwrap(
    api.post('/api/detection/upload', form, {
      timeout: 120000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      },
    })
  );
}
export const getJob = (id) => unwrap(api.get(`/api/detection/jobs/${encodeURIComponent(id)}`)).then((d) => d.job);

// The report needs the login header, so it is fetched here and saved from memory (a plain link would not work).
export async function downloadJobReport(id) {
  const res = await api.get(`/api/detection/jobs/${encodeURIComponent(id)}/report.csv`, {
    responseType: 'blob',
    timeout: 120000,
  });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `detection-report-${id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- alerts ----
export const listAlerts = (params) => api.get('/api/alerts', { params }).then((r) => r.data);
export const getAlert = (id) => unwrap(api.get(`/api/alerts/${encodeURIComponent(id)}`)).then((d) => d.alert);
export const updateAlertStatus = (id, status) =>
  unwrap(api.patch(`/api/alerts/${encodeURIComponent(id)}/status`, { status })).then((d) => d.alert);

// ---- dashboard ----
export const getDashboardStats = () => unwrap(api.get('/api/dashboard/stats'));
export const getDashboardTrends = (days) => unwrap(api.get('/api/dashboard/trends', { params: { days } }));

// ---- incidents ----
export const listIncidents = (params) => api.get('/api/incidents', { params }).then((r) => r.data);
export const createIncident = (body) => unwrap(api.post('/api/incidents', body)).then((d) => d.incident);
export const getIncident = (id) => unwrap(api.get(`/api/incidents/${encodeURIComponent(id)}`)).then((d) => d.incident);
export const updateIncident = (id, body) => unwrap(api.patch(`/api/incidents/${encodeURIComponent(id)}`, body)).then((d) => d.incident);
export const addIncidentNote = (id, text) =>
  unwrap(api.post(`/api/incidents/${encodeURIComponent(id)}/notes`, { text })).then((d) => d.note);

// ---- reports ----
export const createReport = (body) => unwrap(api.post('/api/reports', body)).then((d) => d.report);
export const listReports = (params) => api.get('/api/reports', { params }).then((r) => r.data);
export const getReport = (id) => unwrap(api.get(`/api/reports/${encodeURIComponent(id)}`)).then((d) => d.report);

// ---- assistant ----
// body: { question, alertId? | incidentId?, includeRowValues? }. The server loads the record itself.
export const askAssistant = (body) => unwrap(api.post('/api/assistant/ask', body, { timeout: 60000 }));
// General chat (no documents, no sources). body: { question }. Answers are labelled mode "general".
export const askGeneral = (body) => unwrap(api.post('/api/assistant/chat', body, { timeout: 60000 }));
export const getAssistantStatus = () => unwrap(api.get('/api/assistant/status'));

// ---- agent (suggests actions; a person approves each one) ----
export const getAgentStatus = () => unwrap(api.get('/api/agent/status'));
export const scanAgent = () => unwrap(api.post('/api/agent/scan', {}));
export const listAgentProposals = (params) => api.get('/api/agent/proposals', { params }).then((r) => r.data);
// Nothing is sent with approve: the server runs the stored, validated action itself.
export const approveProposal = (id) => unwrap(api.post(`/api/agent/proposals/${encodeURIComponent(id)}/approve`, {}));
export const rejectProposal = (id, reason) =>
  unwrap(api.post(`/api/agent/proposals/${encodeURIComponent(id)}/reject`, reason ? { reason } : {})).then((d) => d.proposal);

// ---- settings ----
export const updateProfile = (name) => unwrap(api.patch('/api/users/me', { name })).then((d) => d.user);
// Returns { user, token }: changing the password signs out other sessions, and this one continues with the new token.
export const changePassword = (currentPassword, newPassword) => unwrap(api.post('/api/users/me/password', { currentPassword, newPassword }));

export default api;
