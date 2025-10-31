import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
  Navigate: ({ to }) => null,
  BrowserRouter: ({ children }) => children,
}), { virtual: true });

jest.mock('../utils/auth', () => ({
  login: jest.fn(async ({ username }) => ({ ok: true, username })),
  me: jest.fn(async () => null),
}));

const LoginPage = require('../pages/LoginPage').default;
const auth = require('../utils/auth');

describe('Login returnTo behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    try { sessionStorage.removeItem('jarvis_return_to'); } catch (e) {}
  });

  test('LoginPage navigates to sessionStorage returnTo after login', async () => {
    // set return target
    try { sessionStorage.setItem('jarvis_return_to', '/share/test-slug'); } catch (e) {}

    render(<LoginPage />);

    // fill in and submit
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 't' } });
    fireEvent.change(screen.getByPlaceholderText('password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => expect(auth.login).toHaveBeenCalled());
    // expect navigate to have been called with the returnTo path
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/share/test-slug', { replace: true }));
  });

  test('LoginPage falls back to /dashboard/home when no returnTo', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 't' } });
    fireEvent.change(screen.getByPlaceholderText('password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    await waitFor(() => expect(auth.login).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/home', { replace: true }));
  });
});
