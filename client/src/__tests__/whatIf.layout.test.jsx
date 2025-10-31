import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';

// Reuse same auth/context mocks as owner test
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'alice' } })
}));

jest.mock('../utils/auth', () => ({
  me: jest.fn(async () => ({ id: 1, username: 'alice' })),
  apiFetch: jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }))
}));

const WhatIfSimulation = require('../pages/WhatIfSimulation.jsx').default;

const { persistScenarios } = require('../utils/scenarioPersistence');

beforeEach(() => {
  jest.clearAllMocks();
  const saved = [
    { id: 'local-1', name: 'Alice Local', data: { foo: 'a' } },
    { id: 'srv-10', serverId: 10, name: 'Bob Shared', owner: { id: 2, username: 'bob' }, owner_name: 'bob', data: { foo: 'b' } }
  ];
  persistScenarios(saved);
});

afterEach(() => {
  try { persistScenarios([]); } catch (e) {}
});

test('renders #senarios section with My Scenarios and Shared Scenarios panels', async () => {
  render(<WhatIfSimulation enhancedCustomers={[{ id: 'c1', MRR: 100, churnProbability: 0.5 }]} showCustomModal={() => {}} showToast={() => {}} />);

  await waitFor(() => {
    expect(screen.getByLabelText(/Target risk level selector/i)).toBeTruthy();
  });

  // Ensure the scenarios container exists
  const container = screen.getByTestId('senarios');
  expect(container).toBeTruthy();

  // Both panel headings should be present inside the scenarios container
  expect(screen.getByText('My Scenarios')).toBeTruthy();
  expect(screen.getByText('Shared Scenarios')).toBeTruthy();
});
