import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import DashboardPage from './DashboardPage.jsx';
import { dayLabel } from '../components/TrendChart.jsx';

const stats = {
  totalAnalyzedRecords: 12500, completedAnalyses: 3, totalAlerts: 480, highSeverityAlerts: 90, openIncidents: 2,
  categoryDistribution: [{ category: 'DoS', count: 300 }, { category: 'Exploits', count: 180 }],
};
const trends = (days = 14) => ({
  days, timezone: 'UTC',
  series: Array.from({ length: days }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, total: i, high: i % 3 })),
});
const recentPage = { data: [{ id: 'a1', severity: 'critical', attackCategory: 'DoS', attackScore: 0.97, status: 'new', csvLine: 9, createdAt: '2026-10-31T01:00:00Z' }] };

const renderPage = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getDashboardStats.mockResolvedValue(stats);
  api.getDashboardTrends.mockImplementation(async (days) => trends(days));
  api.listAlerts.mockResolvedValue(recentPage);
});

describe('DashboardPage', () => {
  it('shows the four totals with thousands separators', async () => {
    renderPage();
    expect(await screen.findByText('12,500')).toBeInTheDocument();
    expect(screen.getByText('480')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('Open incidents')).toBeInTheDocument();
  });

  it('shows the category distribution as ranked bars with counts', async () => {
    renderPage();
    // "DoS" also appears in the recent-alerts table, so look only inside the category section.
    const heading = await screen.findByText('Alerts by predicted category');
    const bars = within(heading.closest('section'));
    expect(bars.getByText('DoS')).toBeInTheDocument();
    expect(bars.getByText('300')).toBeInTheDocument();
    expect(bars.getByText('Exploits')).toBeInTheDocument();
  });

  it('lists recent alerts', async () => {
    renderPage();
    expect(await screen.findByText('Critical')).toBeInTheDocument();
    expect(api.listAlerts).toHaveBeenCalledWith({ page: 1, limit: 5, sortBy: 'createdAt', order: 'desc' });
  });

  it('starts at 14 days and re-queries when another range is chosen', async () => {
    renderPage();
    await screen.findByText('12,500');
    expect(api.getDashboardTrends).toHaveBeenCalledWith(14);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(api.getDashboardTrends).toHaveBeenLastCalledWith(30));
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers a table view of the chart with every day in it', async () => {
    renderPage();
    await screen.findByText('12,500');
    fireEvent.click(await screen.findByRole('button', { name: 'Show as table' }));
    const table = screen.getByRole('table', { name: 'Alerts per day (UTC)' });
    expect(within(table).getAllByRole('row')).toHaveLength(14 + 1); // 14 days + header
    expect(screen.getByRole('button', { name: 'Show chart' })).toBeInTheDocument();
  });

  it('points to the upload page when nothing has been analysed', async () => {
    api.getDashboardStats.mockResolvedValue({ ...stats, totalAnalyzedRecords: 0, totalAlerts: 0, completedAnalyses: 0, categoryDistribution: [] });
    api.listAlerts.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('Nothing analysed yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /upload a network-flow csv/i })).toBeInTheDocument();
  });

  it('shows an error for a failing section without breaking the others', async () => {
    api.getDashboardStats.mockRejectedValue(apiError(503, 'Database is unavailable. Try again later.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
    expect(await screen.findByText('Critical')).toBeInTheDocument(); // recent alerts still load
  });
});

describe('dayLabel', () => {
  it('formats a UTC day without shifting it to another day', () => {
    expect(dayLabel('2026-10-31')).toBe('Oct 31');
    expect(dayLabel('2027-01-01')).toBe('Jan 1');
  });
  it('returns the input when it is not a date', () => {
    expect(dayLabel('nope')).toBe('nope');
  });
});
