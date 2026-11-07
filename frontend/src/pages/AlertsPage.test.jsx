import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import AlertsPage from './AlertsPage.jsx';

const alertRow = (over = {}) => ({
  id: 'a1', severity: 'critical', attackCategory: 'DoS', attackScore: 0.97, status: 'new',
  sourceFileName: 'flows.csv', csvLine: 9, createdAt: '2026-10-31T01:00:00Z', ...over,
});
const page = (items, total = items.length, pages = 1) => ({ data: items, pagination: { page: 1, limit: 20, total, pages } });

const renderPage = (url = '/alerts') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AlertsPage />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());

// Filter drop-downs repeat the same words as the badges ("Critical", "Open"...), so look only outside <option> elements.
const visible = (text) => screen.getAllByText(text).filter((el) => el.tagName !== 'OPTION');


describe('AlertsPage', () => {
  it('lists alerts with severity, category, score and status as text', async () => {
    api.listAlerts.mockResolvedValue(page([alertRow()]));
    renderPage();
    expect(await screen.findByText('DoS')).toBeInTheDocument();
    expect(visible('Critical')).toHaveLength(1);
    expect(screen.getByText('0.970')).toBeInTheDocument();
    expect(visible('New')).toHaveLength(1);
    expect(screen.getByText('flows.csv (9)')).toBeInTheDocument();
  });

  it('asks the server for the filters in the address bar', async () => {
    api.listAlerts.mockResolvedValue(page([]));
    renderPage('/alerts?severity=high&jobId=abc&page=2');
    await screen.findByText(/no alerts match/i);
    expect(api.listAlerts).toHaveBeenCalledWith({ page: 2, limit: 20, sortBy: 'createdAt', order: 'desc', severity: 'high', jobId: 'abc' });
  });

  it('changing a filter queries again from page 1', async () => {
    api.listAlerts.mockResolvedValue(page([alertRow()]));
    renderPage('/alerts?page=3');
    await screen.findByText('DoS');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } });
    await waitFor(() =>
      expect(api.listAlerts).toHaveBeenLastCalledWith({ page: 1, limit: 20, sortBy: 'createdAt', order: 'desc', status: 'resolved' })
    );
  });

  it('shows an empty state that points to the upload page when there are no alerts at all', async () => {
    api.listAlerts.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText('No alerts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload and analyse a csv/i })).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    api.listAlerts.mockRejectedValue(apiError(503, 'Database is unavailable. Try again later.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
  });

  it('moves between pages with Next and Previous', async () => {
    api.listAlerts.mockResolvedValue(page([alertRow()], 45, 3));
    renderPage();
    await screen.findByText('DoS');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.listAlerts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });
});
