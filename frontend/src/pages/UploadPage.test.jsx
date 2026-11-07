import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import UploadPage from './UploadPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/upload']}>
      <Routes>
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/jobs/:id" element={<p>Job page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const choose = (file) => fireEvent.change(document.getElementById('csv-file'), { target: { files: [file] } });
const csvFile = (name = 'flows.csv', content = 'a,b\n1,2\n') => new File([content], name, { type: 'text/csv' });
const submitButton = () => screen.getByRole('button', { name: /upload and analyse/i });

beforeEach(() => vi.clearAllMocks());

describe('UploadPage', () => {
  it('starts with the upload button disabled', () => {
    renderPage();
    expect(submitButton()).toBeDisabled();
  });

  it('shows file name, size and a positive check for a valid file', () => {
    renderPage();
    choose(csvFile());
    expect(screen.getByText('flows.csv')).toBeInTheDocument();
    expect(screen.getByText(/looks fine/i)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it('explains why a wrong file type is not accepted and keeps the button disabled', () => {
    renderPage();
    choose(csvFile('notes.txt'));
    expect(screen.getByText(/must end with \.csv/i)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('rejects an empty file', () => {
    renderPage();
    choose(csvFile('empty.csv', ''));
    expect(screen.getByText(/file is empty/i)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('uploads, then opens the job page', async () => {
    api.uploadCsv.mockResolvedValue({ job: { id: 'job123' } });
    renderPage();
    choose(csvFile());
    fireEvent.click(submitButton());
    expect(await screen.findByText('Job page')).toBeInTheDocument();
    expect(api.uploadCsv).toHaveBeenCalledTimes(1);
    expect(api.uploadCsv.mock.calls[0][0].name).toBe('flows.csv');
  });

  it('shows the server error with the missing column names', async () => {
    api.uploadCsv.mockRejectedValue(
      apiError(400, 'The CSV columns do not match what the model needs.', { missingColumns: ['dur', 'rate'], totalMissing: 2 })
    );
    renderPage();
    choose(csvFile());
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('do not match what the model needs');
    expect(alert).toHaveTextContent('Missing columns: dur, rate');
    await waitFor(() => expect(submitButton()).toBeEnabled()); // the user can fix the file and retry
  });

  it('shows an honest message when detection is not configured', async () => {
    api.uploadCsv.mockRejectedValue(apiError(503, 'Detection is not configured: no trained model is available yet.'));
    renderPage();
    choose(csvFile());
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
  });

  it('allows the file to be removed', () => {
    renderPage();
    choose(csvFile());
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByText('flows.csv')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });
});
