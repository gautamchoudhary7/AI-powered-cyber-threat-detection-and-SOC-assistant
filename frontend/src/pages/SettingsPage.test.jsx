import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const auth = { user: { id: 'u1', name: 'Asha Verma', email: 'asha@example.com', role: 'analyst' }, updateProfile: vi.fn(), changePassword: vi.fn() };
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => auth }));

import { apiError } from '../test/mockApi.js';
import SettingsPage from './SettingsPage.jsx';

beforeEach(() => vi.clearAllMocks());

describe('Profile form', () => {
  it('shows email and role as read-only text and disables Save until the name changes', () => {
    render(<SettingsPage />);
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Asha V  ' } });
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
  });

  it('saves the trimmed name and confirms', async () => {
    auth.updateProfile.mockResolvedValue({});
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Asha V  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(auth.updateProfile).toHaveBeenCalledWith('Asha V');
  });

  it('shows the server error', async () => {
    auth.updateProfile.mockRejectedValue(apiError(400, 'Validation failed', [{ field: 'name', message: 'Name must be at least 2 characters' }]));
    render(<SettingsPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
  });
});

describe('Password form', () => {
  const fill = (current, next, confirm) => {
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  };

  it('stays disabled until the new password is long enough and confirmed', () => {
    render(<SettingsPage />);
    const submit = screen.getByRole('button', { name: 'Change password' });
    fill('OldPassword123', 'short1', 'short1');
    expect(submit).toBeDisabled();
    fill('OldPassword123', 'NewPassword456', 'NewPassword4');
    expect(screen.getByText('The two new passwords do not match.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fill('OldPassword123', 'NewPassword456', 'NewPassword456');
    expect(submit).toBeEnabled();
  });

  it('changes the password, clears the boxes and says other sessions were signed out', async () => {
    auth.changePassword.mockResolvedValue({});
    render(<SettingsPage />);
    fill('OldPassword123', 'NewPassword456', 'NewPassword456');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Other sessions were signed out/)).toBeInTheDocument();
    expect(auth.changePassword).toHaveBeenCalledWith('OldPassword123', 'NewPassword456');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('shows a wrong-current-password error and keeps what was typed', async () => {
    auth.changePassword.mockRejectedValue(apiError(400, 'Current password is incorrect'));
    render(<SettingsPage />);
    fill('WrongPassword1', 'NewPassword456', 'NewPassword456');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.getByLabelText('New password')).toHaveValue('NewPassword456');
  });
});
