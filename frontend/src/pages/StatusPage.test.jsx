import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', () => ({
  getBackendHealth: vi.fn(),
  getMlHealth: vi.fn(),
}));

import { getBackendHealth, getMlHealth } from '../api/client.js';
import StatusPage from './StatusPage.jsx';

describe('StatusPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows both services online and the honest detection status', async () => {
    getBackendHealth.mockResolvedValue({ status: 'ok' });
    getMlHealth.mockResolvedValue({
      reachable: true,
      status: 'ok',
      detection: 'not configured (no trained model found)',
    });
    render(<StatusPage />);
    expect(await screen.findByText(/not configured/i)).toBeInTheDocument();
    expect(screen.getAllByText('Online')).toHaveLength(2);
  });

  it('shows an error when the backend is unreachable', async () => {
    getBackendHealth.mockRejectedValue(new Error('network'));
    getMlHealth.mockRejectedValue(new Error('network'));
    render(<StatusPage />);
    expect(await screen.findByText(/Could not reach the backend/i)).toBeInTheDocument();
    expect(screen.getAllByText('Unreachable')).toHaveLength(2);
  });

  it('shows unreachable when the backend cannot reach the ML service', async () => {
    getBackendHealth.mockResolvedValue({ status: 'ok' });
    getMlHealth.mockResolvedValue({ reachable: false });
    render(<StatusPage />);
    expect(await screen.findByText(/cannot reach the ML service/i)).toBeInTheDocument();
  });
});
