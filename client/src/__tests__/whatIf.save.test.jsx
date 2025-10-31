import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, username: 'alice' } }) }));
// Prevent any real network calls by mocking auth utils module at load time
jest.mock('../utils/auth', () => ({ me: jest.fn(), apiFetch: jest.fn() }));

describe('WhatIf optimistic save', () => {
  const { persistScenarios, readSavedScenarios } = require('../utils/scenarioPersistence');
  beforeEach(() => { persistScenarios([]); jest.clearAllMocks(); });

  test('saves optimistically and persists when server ok', async () => {
  const authMock = require('../utils/auth');
  authMock.me.mockResolvedValue({ id: 1, username: 'alice' });
  authMock.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 123 }) });

  const WhatIf = require('../pages/WhatIfSimulation.jsx').default;
    render(<WhatIf enhancedCustomers={[{ id: 'c1', MRR: 100 }]} showCustomModal={() => {}} showToast={() => {}} />);

    // enter a name and click save
    const input = screen.getByLabelText(/Scenario name/i);
    fireEvent.change(input, { target: { value: 'Test Save' } });
    const saveBtn = screen.getByRole('button', { name: /Save scenario/i });
    fireEvent.click(saveBtn);

  // optimistic: should appear in storage via helper quickly
  await waitFor(() => expect(readSavedScenarios()).toBeTruthy());
  const listAfter = readSavedScenarios() || [];
  expect(listAfter[0].name).toBe('Test Save');
  });

  test('reverts optimistic save on server failure', async () => {
  const authMock = require('../utils/auth');
  authMock.me.mockResolvedValue({ id: 1, username: 'alice' });
  authMock.apiFetch.mockResolvedValue({ ok: false, status: 500 });

  const WhatIf = require('../pages/WhatIfSimulation.jsx').default;
    render(<WhatIf enhancedCustomers={[{ id: 'c1', MRR: 100 }]} showCustomModal={() => {}} showToast={() => {}} />);

    const input = screen.getByLabelText(/Scenario name/i);
    fireEvent.change(input, { target: { value: 'Fail Save' } });
    const saveBtn = screen.getByRole('button', { name: /Save scenario/i });
    fireEvent.click(saveBtn);

    // optimistic save may create item, but after server failure it should revert
    // wait for revert: give slightly longer timeout
    await waitFor(() => {
      const list = readSavedScenarios() || [];
      expect(!(list.length > 0 && list[0].name === 'Fail Save')).toBe(true);
    }, { timeout: 2000 });
  });
});
