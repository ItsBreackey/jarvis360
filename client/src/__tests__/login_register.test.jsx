import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// mock react-router-dom (useNavigate and BrowserRouter) so tests don't require the real package
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
  // BrowserRouter can just render children for tests
  BrowserRouter: ({ children }) => children,
  // Navigate is used by pages as a fallback redirect; render null in tests
  Navigate: ({ to, replace }) => null,
}), { virtual: true });

jest.mock('../utils/auth', () => ({
  login: jest.fn(async ({ username }) => ({ ok: true, username })),
  register: jest.fn(async ({ username }) => ({ ok: true, username })),
  me: jest.fn(async () => null),
}));

// require pages after mocking auth so the mock is used
const LoginPage = require('../pages/LoginPage').default;
const RegisterPage = require('../pages/RegisterPage').default;
const auth = require('../utils/auth');

describe('Auth pages', () => {
  test('LoginPage renders and calls auth.login', async () => {
    render(<LoginPage />);
    const username = screen.getByPlaceholderText('username');
    const password = screen.getByPlaceholderText('password');
    fireEvent.change(username, { target: { value: 'testuser' } });
    fireEvent.change(password, { target: { value: 'pass' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
  await waitFor(() => expect(auth.login).toHaveBeenCalled());
  // navigation to dashboard should be triggered
  await waitFor(() => expect(require('react-router-dom').useNavigate()).toHaveBeenCalled());
  });

  test('RegisterPage renders and calls auth.register', async () => {
    render(<RegisterPage />);
    const username = screen.getByPlaceholderText('username');
    const password = screen.getByPlaceholderText('password');
    fireEvent.change(username, { target: { value: 'newuser' } });
    fireEvent.change(password, { target: { value: 'pass' } });
  fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
  await waitFor(() => expect(auth.register).toHaveBeenCalled());
  await waitFor(() => expect(require('react-router-dom').useNavigate()).toHaveBeenCalled());
  });

  test('LoginPage shows error when auth.login rejects', async () => {
    const authMock = require('../utils/auth');
    authMock.login.mockImplementationOnce(() => { throw new Error('bad creds'); });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('password'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
  await waitFor(() => expect(authMock.login).toHaveBeenCalled());
  // the UI surfaces the server error message text
  await waitFor(() => expect(screen.getByText(/bad creds/i)).toBeTruthy());
  });

  test('LoginPage redirects if already authenticated (auth.me)', async () => {
    const authMock = require('../utils/auth');
    authMock.me.mockImplementationOnce(async () => ({ username: 'already' }));
    const mockNavigate = require('react-router-dom').useNavigate();
    render(<LoginPage />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/home', { replace: true }));
  });

  test('RegisterPage redirects if already authenticated (auth.me)', async () => {
    const authMock = require('../utils/auth');
    authMock.me.mockImplementationOnce(async () => ({ username: 'already' }));
    const mockNavigate = require('react-router-dom').useNavigate();
    render(<RegisterPage />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/home', { replace: true }));
  });
});
