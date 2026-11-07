import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import AgentPage from './AgentPage.jsx';

const ALERT = 'a'.repeat(24);
const proposal = (over = {}) => ({
  id: 'p1', action: 'set_alert_status', actionLabel: "Change an alert's status", summary: 'Mark alert aaaaaa as "investigating".',
  rationale: 'It is critical and still new.', ruleId: 'triage_critical', status: 'pending',
  evidence: { alertIds: [ALERT], incidentIds: [] }, createdAt: '2026-11-02T01:00:00Z', expiresAt: '2026-11-09T01:00:00Z',
  decidedAt: null, decisionReason: null, executedAt: null, result: null, ...over,
});
const page = (items) => ({ data: items, pagination: { page: 1, limit: 20, total: items.length, pages: 1 } });
const renderPage = () => render(<MemoryRouter><AgentPage /></MemoryRouter>);

// Filter drop-downs repeat the same words as the badges ("Critical", "Open"...), so look only outside <option> elements.
const visible = (text) => screen.getAllByText(text).filter((el) => el.tagName !== 'OPTION');

beforeEach(() => {
  vi.clearAllMocks();
  api.getAgentStatus.mockResolvedValue({ enabled: true, ttlDays: 7, usesLanguageModel: false, actions: [] });
  api.listAgentProposals.mockResolvedValue(page([proposal()]));
});

describe('AgentPage', () => {
  it('explains that nothing happens without approval and lists pending suggestions with their evidence', async () => {
    renderPage();
    expect(await screen.findByText('Mark alert aaaaaa as "investigating".')).toBeInTheDocument();
    expect(screen.getByText(/never does anything on its own/)).toBeInTheDocument();
    expect(visible('Waiting for your decision')).toHaveLength(1);
    expect(screen.getByRole('link', { name: `alert ${ALERT.slice(-6)}` })).toHaveAttribute('href', `/alerts/${ALERT}`);
    expect(api.listAgentProposals).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'pending' });
  });

  it('renders suggestion text as plain text, never as HTML', async () => {
    api.listAgentProposals.mockResolvedValue(page([proposal({ summary: '<img src=x onerror=alert(1)> create', rationale: '<script>x</script>' })]));
    const { container } = renderPage();
    await screen.findByText(/create/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('asks for confirmation first: nothing is sent until the person confirms', async () => {
    api.approveProposal.mockResolvedValue({ proposal: proposal({ status: 'executed' }), result: { ok: true, message: 'Alert status changed to "investigating".', resourceId: ALERT } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByText(/It is not undone automatically/)).toBeInTheDocument();
    expect(api.approveProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve and run it' }));
    expect(await screen.findByText(/Done: Alert status changed/)).toBeInTheDocument();
    expect(api.approveProposal).toHaveBeenCalledWith('p1'); // only the id: the client never says what to run
    expect(visible('Done')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('cancelling the confirmation sends nothing', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.approveProposal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('says plainly when an approved action changed nothing', async () => {
    api.approveProposal.mockResolvedValue({
      proposal: proposal({ status: 'failed' }), result: { ok: false, message: 'The record changed or is no longer available, so nothing was changed. Run a new scan.' },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve and run it' }));
    expect(await screen.findByText(/Nothing was changed: The record changed/)).toBeInTheDocument();
    expect(visible('Failed, nothing changed')).toHaveLength(1);
  });

  it('shows the server error when approving fails, and allows trying again', async () => {
    api.approveProposal.mockRejectedValue(apiError(409, 'This suggestion was already executed.'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve and run it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already executed');
    expect(screen.getByRole('button', { name: 'Yes, approve and run it' })).toBeEnabled();
  });

  it('rejects with an optional reason', async () => {
    api.rejectProposal.mockResolvedValue(proposal({ status: 'rejected', decisionReason: 'not relevant', decidedAt: '2026-11-02T02:00:00Z' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: '  not relevant ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject this suggestion' }));
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(api.rejectProposal).toHaveBeenCalledWith('p1', 'not relevant');
    expect(screen.getByText(/Reason given: not relevant/)).toBeInTheDocument();
    expect(api.approveProposal).not.toHaveBeenCalled();
  });

  it('scans, reports how many were new, and reloads the list', async () => {
    api.scanAgent.mockResolvedValue({ created: 2, skippedExisting: 1, truncated: false, proposals: [] });
    renderPage();
    await screen.findByText('Mark alert aaaaaa as "investigating".');
    fireEvent.click(screen.getByRole('button', { name: 'Scan for suggestions' }));
    expect(await screen.findByText('2 new suggestions, 1 already seen before.')).toBeInTheDocument();
    expect(api.scanAgent).toHaveBeenCalledWith();
    await waitFor(() => expect(api.listAgentProposals.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('shows a scan error', async () => {
    api.scanAgent.mockRejectedValue(apiError(429, 'Too many agent requests. Please wait a few minutes and try again.'));
    renderPage();
    await screen.findByText('Mark alert aaaaaa as "investigating".');
    fireEvent.click(screen.getByRole('button', { name: 'Scan for suggestions' }));
    expect(await screen.findByText(/Too many agent requests/)).toBeInTheDocument();
  });

  it('shows an empty state that points to scanning', async () => {
    api.listAgentProposals.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText('Nothing is waiting for your decision')).toBeInTheDocument();
  });

  it('offers no decision buttons for suggestions that are already decided', async () => {
    api.listAgentProposals.mockResolvedValue(page([proposal({ status: 'executed', result: { ok: true, message: 'Incident created.' } })]));
    renderPage();
    await screen.findByText('Done: Incident created.');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('when the agent is turned off, says so and disables scanning and deciding', async () => {
    api.getAgentStatus.mockResolvedValue({ enabled: false });
    renderPage();
    expect(await screen.findByText('The agent is turned off on this server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan for suggestions' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('shows only the first five alert links and counts the rest', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => i.toString(16).padStart(24, 'b'));
    api.listAgentProposals.mockResolvedValue(page([proposal({ evidence: { alertIds: ids, incidentIds: [] } })]));
    renderPage();
    const card = (await screen.findByText(/Based on:/)).closest('li');
    expect(within(card).getAllByRole('link')).toHaveLength(5);
    expect(within(card).getByText('and 3 more alerts')).toBeInTheDocument();
  });
});
