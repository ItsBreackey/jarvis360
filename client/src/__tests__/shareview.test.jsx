import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useParams: () => ({ slug: 'test-slug' }),
  useNavigate: () => mockNavigate,
}));

jest.mock('../utils/auth', () => ({ me: jest.fn(async () => null) }));

// mock fetch to return a simple dashboard payload
const fakeRespBody = { id: 42, name: 'Shared scenario', config: { data: { foo: 'bar' } }, created_at: new Date().toISOString() };
const fakeResp = { ok: true, json: async () => fakeRespBody };
global.fetch = jest.fn(() => Promise.resolve(fakeResp));
if (typeof window !== 'undefined') {
  // ensure window.fetch and global.fetch point to the same mock in JSDOM
  window.fetch = global.fetch;
}

const ShareView = require('../components/ShareView').default;

describe('ShareView behavior', () => {
  const { persistScenarios, readSavedScenarios } = require('../utils/scenarioPersistence');
  beforeEach(() => {
    jest.clearAllMocks();
    persistScenarios([]);
    try { sessionStorage.removeItem('jarvis_return_to'); } catch (e) {}
  });

  test('persist shared scenario to localStorage and set autoload marker', async () => {
    // render with slug param via window.location
    const pathBackup = window.location.pathname;
    delete window.location;
    window.location = { pathname: '/share/test-slug', search: '' };

  // ensure the fetch mock is available at render time (some environments reset globals)
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => fakeRespBody }));
  if (typeof window !== 'undefined') window.fetch = global.fetch;

  render(<ShareView showToast={() => {}} />);

  // wait for the shared scenario to be persisted via helper
  await waitFor(() => expect(readSavedScenarios()).toBeTruthy());
  const arr = readSavedScenarios() || [];
  expect(arr.length).toBeGreaterThan(0);

  // clicking Save should prompt login (we mock auth.me to return null) and set a return target
  const saveBtn = await screen.findByRole('button', { name: /Save to my scenarios/i });
  expect(saveBtn).toBeTruthy();
  fireEvent.click(saveBtn);

  await waitFor(() => expect(sessionStorage.getItem('jarvis_return_to')).toBe('/share/test-slug'));
  // ensure our mocked navigate was used to go to /login
  expect(mockNavigate).toHaveBeenCalledWith('/login', expect.any(Object));

    // restore
    window.location = { pathname: pathBackup };
  });
});
