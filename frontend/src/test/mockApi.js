// Builds a fake version of api/client.js for tests, so no real server is needed.
import { vi } from 'vitest';

export function makeApiMock() {
  return {
    setToken: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    getBackendHealth: vi.fn(),
    getMlHealth: vi.fn(),
    registerUser: vi.fn(),
    loginUser: vi.fn(),
    getMe: vi.fn(),
    uploadCsv: vi.fn(),
    getJob: vi.fn(),
    downloadJobReport: vi.fn(),
    listAlerts: vi.fn(),
    getAlert: vi.fn(),
    updateAlertStatus: vi.fn(),
    getDashboardStats: vi.fn(),
    getDashboardTrends: vi.fn(),
    listIncidents: vi.fn(),
    createIncident: vi.fn(),
    getIncident: vi.fn(),
    updateIncident: vi.fn(),
    addIncidentNote: vi.fn(),
    askAssistant: vi.fn(),
    askGeneral: vi.fn(),
    getAgentStatus: vi.fn(),
    scanAgent: vi.fn(),
    listAgentProposals: vi.fn(),
    approveProposal: vi.fn(),
    rejectProposal: vi.fn(),
    // A working default, because pages that embed the assistant panel ask for its status when they open.
    getAssistantStatus: vi.fn().mockResolvedValue({ reachable: true, status: 'ok', llmConfigured: true, rowValuesAllowed: true, generalChatAllowed: true }),
    createReport: vi.fn(),
    listReports: vi.fn(),
    getReport: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
}

// An error shaped like the ones axios throws for a response from our API.
export const apiError = (status, message, details) => ({
  response: { status, data: { success: false, error: { message, ...(details ? { details } : {}) } } },
});
