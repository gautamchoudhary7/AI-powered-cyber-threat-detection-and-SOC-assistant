import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import IncidentsPage from './IncidentsPage.jsx';
import IncidentDetailPage from './IncidentDetailPage.jsx';

const row = (over = {}) => ({ id: 'i1', title: 'Suspicious scan', severity: 'high', status: 'open', alertCount: 2, createdAt: '2026-10-31T01:00:00Z', ...over });
const listPage = (items) => ({ data: items, pagination: { page: 1, limit: 20, total: items.length, pages: 1 } });

function renderList(url = '/incidents') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<p>Detail page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

// Filter drop-downs repeat the same words as the badges ("Critical", "Open"...), so look only outside <option> elements.
const visible = (text) => screen.getAllByText(text).filter((el) => el.tagName !== 'OPTION');


describe('IncidentsPage', () => {
  it('lists incidents with severity and status as text', async () => {
    api.listIncidents.mockResolvedValue(listPage([row()]));
    renderList();
    expect(await screen.findByRole('link', { name: 'Suspicious scan' })).toBeInTheDocument();
    expect(visible('High')).toHaveLength(1);
    expect(visible('Open')).toHaveLength(1);
  });

  it('filters through the address bar and queries again', async () => {
    api.listIncidents.mockResolvedValue(listPage([row()]));
    renderList('/incidents?status=closed');
    await screen.findByRole('link', { name: 'Suspicious scan' });
    expect(api.listIncidents).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'closed' });
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'low' } });
    await waitFor(() => expect(api.listIncidents).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'closed', severity: 'low' }));
  });

  it('shows a helpful empty state', async () => {
    api.listIncidents.mockResolvedValue(listPage([]));
    renderList();
    expect(await screen.findByText('No incidents yet')).toBeInTheDocument();
  });

  it('creates an incident and opens it', async () => {
    api.listIncidents.mockResolvedValue(listPage([]));
    api.createIncident.mockResolvedValue({ id: 'new1' });
    renderList();
    await screen.findByText('No incidents yet');
    fireEvent.click(screen.getByRole('button', { name: /new incident/i }));
    const submit = screen.getByRole('button', { name: 'Create incident' });
    expect(submit).toBeDisabled(); // title is too short
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  Port scan from one host  ' } });
    fireEvent.click(submit);
    expect(await screen.findByText('Detail page')).toBeInTheDocument();
    expect(api.createIncident).toHaveBeenCalledWith({ title: 'Port scan from one host', description: undefined, severity: 'medium' });
  });

  it('shows the server error when creating fails', async () => {
    api.listIncidents.mockResolvedValue(listPage([]));
    api.createIncident.mockRejectedValue(apiError(400, 'Validation failed', [{ field: 'title', message: 'Title must be at least 3 characters' }]));
    renderList();
    await screen.findByText('No incidents yet');
    fireEvent.click(screen.getByRole('button', { name: /new incident/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create incident' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Validation failed');
    expect(alert).toHaveTextContent('title: Title must be at least 3 characters');
  });
});

describe('IncidentDetailPage', () => {
  const incident = () => ({
    id: 'i1', title: 'Suspicious scan', description: 'Seen in flows.csv', severity: 'high', status: 'open', alertCount: 1, noteCount: 1,
    createdAt: '2026-10-31T01:00:00Z',
    alerts: [{ id: 'a1', severity: 'critical', status: 'new', attackCategory: 'DoS', attackScore: 0.97, sourceFileName: 'f.csv', csvLine: 9 }],
    notes: [{ id: 'n1', text: '<b>not bold</b>\nsecond line', author: 'Asha', createdAt: '2026-10-31T02:00:00Z' }],
  });
  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={['/incidents/i1']}>
        <Routes><Route path="/incidents/:id" element={<IncidentDetailPage />} /></Routes>
      </MemoryRouter>
    );

  it('shows fields, linked alerts and notes, rendering note text as plain text', async () => {
    api.getIncident.mockResolvedValue(incident());
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Suspicious scan' })).toBeInTheDocument();
    expect(screen.getByText(/DoS/)).toBeInTheDocument();
    expect(screen.getByText(/line 9/)).toBeInTheDocument();
    const note = screen.getByText(/not bold/);
    expect(note.textContent).toContain('<b>not bold</b>'); // the tags are visible text, not HTML
    expect(note.querySelector('b')).toBeNull();
  });

  it('saves only the fields that changed', async () => {
    api.getIncident.mockResolvedValue(incident());
    api.updateIncident.mockResolvedValue({ ...incident(), status: 'contained' });
    renderDetail();
    await screen.findByRole('heading', { name: 'Suspicious scan' });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'contained' } });
    fireEvent.click(save);
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(api.updateIncident).toHaveBeenCalledWith('i1', { status: 'contained' });
  });

  it('adds a note and clears the box', async () => {
    api.getIncident.mockResolvedValue(incident());
    api.addIncidentNote.mockResolvedValue({ id: 'n2', text: 'Blocked the host', author: 'Asha', createdAt: '2026-10-31T03:00:00Z' });
    renderDetail();
    await screen.findByRole('heading', { name: 'Suspicious scan' });
    const add = screen.getByRole('button', { name: 'Add note' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: ' Blocked the host ' } });
    fireEvent.click(add);
    expect(await screen.findByText('Blocked the host')).toBeInTheDocument();
    expect(api.addIncidentNote).toHaveBeenCalledWith('i1', 'Blocked the host');
    expect(screen.getByLabelText('Add a note')).toHaveValue('');
  });

  it('shows a not-found message for another user’s incident', async () => {
    api.getIncident.mockRejectedValue(apiError(404, 'Incident not found'));
    renderDetail();
    expect(await screen.findByText('Incident not found')).toBeInTheDocument();
  });
});
