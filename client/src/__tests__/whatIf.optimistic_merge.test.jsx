import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, username: 'alice' } }) }));
// Mock auth utilities to control server responses
jest.mock('../utils/auth', () => ({ me: jest.fn(), apiFetch: jest.fn() }));

describe('WhatIf optimistic -> server-confirm merge', () => {
  const { persistScenarios, readSavedScenarios } = require('../utils/scenarioPersistence');
  beforeEach(() => { persistScenarios([]); jest.clearAllMocks(); });

  test('optimistic save is replaced by server-backed item (srv- prefix)', async () => {
    const authMock = require('../utils/auth');
    authMock.me.mockResolvedValue({ id: 1, username: 'alice' });
    // Simulate server create: respond with new id
    authMock.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 555, created_at: '2025-01-01T00:00:00.000Z' }) });

    const WhatIf = require('../pages/WhatIfSimulation.jsx').default;
    render(<WhatIf enhancedCustomers={[{ id: 'c1', MRR: 100 }]} showCustomModal={() => {}} showToast={() => {}} />);

    const input = screen.getByLabelText(/Scenario name/i);
    fireEvent.change(input, { target: { value: 'Merge Test' } });
    const saveBtn = screen.getByRole('button', { name: /Save scenario/i });
    fireEvent.click(saveBtn);

  // Immediately, optimistic entry should be present in storage via helper
  await waitFor(() => expect(readSavedScenarios()).toBeTruthy());
  const optList = readSavedScenarios() || [];
    expect(optList.length).toBeGreaterThan(0);
    expect(optList[0].name).toBe('Merge Test');
    // optimistic id should not start with srv-
    expect(optList[0].id.startsWith('srv-')).toBe(false);

    // After server confirm the stored item should be replaced/updated to srv-<id>
    await waitFor(() => {
      const list = readSavedScenarios() || [];
      return list.length > 0 && list[0].id === 'srv-555';
    }, { timeout: 2000 });

    const listAfter = readSavedScenarios() || [];
    expect(listAfter[0].id).toBe('srv-555');
    expect(listAfter[0].serverId).toBe(555);
    expect(listAfter[0].name).toBe('Merge Test');
  });
});
