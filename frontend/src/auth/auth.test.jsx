import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoginPage from '../pages/LoginPage.jsx';

const user = { id: 'u1', name: 'Asha', email: 'a@b.com', role: 'analyst' };

function renderApp(initial = '/secret') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/secret" element={<p>Secret page</p>} />
            <Route path="/upload" element={<p>Upload page</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('ProtectedRoute', () => {
  it('sends a logged-out visitor to the login page', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument();
  });

  it('lets a visitor with a valid saved token in', async () => {
    window.sessionStorage.setItem('soc_token', 'saved-token');
    api.getMe.mockResolvedValue(user);
    renderApp();
    expect(await screen.findByText('Secret page')).toBeInTheDocument();
    expect(api.setToken).toHaveBeenCalledWith('saved-token');
  });

  it('forgets a saved token that the server rejects', async () => {
    window.sessionStorage.setItem('soc_token', 'stale');
    api.getMe.mockRejectedValue(apiError(401, 'Token expired'));
    renderApp();
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('soc_token')).toBeNull();
  });

  it('keeps the token when the server is merely unreachable', async () => {
    window.sessionStorage.setItem('soc_token', 'keep-me');
    api.getMe.mockRejectedValue({ message: 'Network Error' });
    renderApp();
    expect(await screen.findByRole('heading', { name: /log in/i })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('soc_token')).toBe('keep-me');
  });
});

describe('LoginPage', () => {
  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Str0ngPassw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
  }

  it('logs in, stores the token and returns to the page the visitor wanted', async () => {
    api.loginUser.mockResolvedValue({ user, token: 'new-token' });
    renderApp('/secret');
    await screen.findByRole('heading', { name: /log in/i });
    fillAndSubmit();
    expect(await screen.findByText('Secret page')).toBeInTheDocument();
    expect(api.loginUser).toHaveBeenCalledWith({ email: 'a@b.com', password: 'Str0ngPassw0rd' });
    expect(window.sessionStorage.getItem('soc_token')).toBe('new-token');
  });

  it('shows the server message when the login fails and stays on the page', async () => {
    api.loginUser.mockRejectedValue(apiError(401, 'Invalid email or password'));
    renderApp('/login');
    await screen.findByRole('heading', { name: /log in/i });
    fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    await waitFor(() => expect(screen.getByRole('button', { name: /log in/i })).toBeEnabled());
    expect(window.sessionStorage.getItem('soc_token')).toBeNull();
  });
});
