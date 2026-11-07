import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());
vi.mock('../utils/download.js', async (orig) => ({ ...(await orig()), downloadText: vi.fn() }));

import * as api from '../api/client.js';
import { downloadText } from '../utils/download.js';
import { apiError } from '../test/mockApi.js';
import ReportsPage from './ReportsPage.jsx';
import ReportDetailPage from './ReportDetailPage.jsx';
import GenerateReportButton from '../components/GenerateReportButton.jsx';

const row = (over = {}) => ({ id: 'r1', title: 'Detection summary: flows.csv', type: 'detection_summary', createdAt: '2026-11-01T01:00:00Z', ...over });
const listPage = (items) => ({ data: items, pagination: { page: 1, limit: 20, total: items.length, pages: 1 } });

beforeEach(() => vi.clearAllMocks());

describe('ReportsPage', () => {
  const renderList = (url = '/reports') =>
    render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/reports" element={<ReportsPage />} /></Routes></MemoryRouter>);

  it('lists reports with a readable type', async () => {
    api.listReports.mockResolvedValue(listPage([row()]));
    renderList();
    expect(await screen.findByRole('link', { name: 'Detection summary: flows.csv' })).toHaveAttribute('href', '/reports/r1');
    expect(screen.getByRole('cell', { name: 'Detection summary' })).toBeInTheDocument();
  });

  it('filters by type through the address bar', async () => {
    api.listReports.mockResolvedValue(listPage([row()]));
    renderList('/reports?type=incident');
    await screen.findByRole('link', { name: /Detection summary/ });
    expect(api.listReports).toHaveBeenCalledWith({ page: 1, limit: 20, type: 'incident' });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: '' } });
    await waitFor(() => expect(api.listReports).toHaveBeenLastCalledWith({ page: 1, limit: 20 }));
  });

  it('shows an empty state and an error state', async () => {
    api.listReports.mockResolvedValueOnce(listPage([]));
    const { unmount } = renderList();
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
    unmount();
    api.listReports.mockRejectedValueOnce(apiError(503, 'Database is unavailable. Try again later.'));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
  });
});

describe('ReportDetailPage', () => {
  const renderDetail = () =>
    render(<MemoryRouter initialEntries={['/reports/r1']}><Routes><Route path="/reports/:id" element={<ReportDetailPage />} /></Routes></MemoryRouter>);
  const report = () => ({ ...row(), relatedJob: 'j1', relatedIncident: null, content: '# Title\n\n<img src=x onerror=alert(1)>\n| a | b |' });

  it('shows the report as plain text, never as HTML', async () => {
    api.getReport.mockResolvedValue(report());
    const { container } = renderDetail();
    expect(await screen.findByRole('heading', { name: 'Detection summary: flows.csv' })).toBeInTheDocument();
    expect(container.querySelector('pre').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'source analysis' })).toHaveAttribute('href', '/jobs/j1');
  });

  it('downloads the markdown with a safe file name', async () => {
    api.getReport.mockResolvedValue(report());
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    expect(downloadText).toHaveBeenCalledWith('detection-summary-flows-csv.md', report().content);
  });

  it('copies the text, and says so when copying is blocked', async () => {
    api.getReport.mockResolvedValue(report());
    const writeText = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('blocked'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDetail();
    const copy = await screen.findByRole('button', { name: /copy text/i });
    fireEvent.click(copy);
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(report().content);
    fireEvent.click(copy);
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it('shows not-found for another user’s report', async () => {
    api.getReport.mockRejectedValue(apiError(404, 'Report not found'));
    renderDetail();
    expect(await screen.findByText('Report not found')).toBeInTheDocument();
  });
});

describe('GenerateReportButton', () => {
  const renderButton = (request) =>
    render(
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route path="/start" element={<GenerateReportButton request={request} />} />
          <Route path="/reports/:id" element={<p>Report page</p>} />
        </Routes>
      </MemoryRouter>
    );

  it('creates the report from the ids only and opens it', async () => {
    api.createReport.mockResolvedValue({ id: 'r9' });
    renderButton({ type: 'incident', incidentId: 'i1' });
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    expect(await screen.findByText('Report page')).toBeInTheDocument();
    expect(api.createReport).toHaveBeenCalledWith({ type: 'incident', incidentId: 'i1' });
  });

  it('shows the server error and lets the user try again', async () => {
    api.createReport.mockRejectedValue(apiError(409, 'A report can only be made after the analysis has completed.'));
    renderButton({ type: 'detection_summary', jobId: 'j1' });
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('only be made after the analysis has completed');
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled();
  });
});
