import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';

// Mock auth context to return a current user 'alice'
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'alice' } })
}));

// Stub auth utils used inside the component
jest.mock('../utils/auth', () => ({
  me: jest.fn(async () => ({ id: 1, username: 'alice' })),
  apiFetch: jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }))
}));

// Import the extracted WhatIfSimulation page implementation
const WhatIfSimulation = require('../pages/WhatIfSimulation.jsx').default;

const { persistScenarios } = require('../utils/scenarioPersistence');

beforeEach(() => {
  jest.clearAllMocks();
  // Seed saved scenarios with one owned by alice and one by bob
  const saved = [
    { id: 'local-1', name: 'Alice Local', data: { foo: 'a' } },
    { id: 'srv-10', serverId: 10, name: 'Bob Shared', owner: { id: 2, username: 'bob' }, owner_name: 'bob', data: { foo: 'b' } },
    { id: 'srv-11', serverId: 11, name: 'Alice Shared', owner: { id: 1, username: 'alice' }, owner_name: 'alice', data: { foo: 'c' } }
  ];
  persistScenarios(saved);
});

afterEach(() => {
  try { persistScenarios([]); } catch (e) {}
});

test('renders owner_name and read-only state correctly', async () => {
  // Render the component
  const utils = render(<WhatIfSimulation enhancedCustomers={[{ id: 'c1', MRR: 100, churnProbability: 0.5 }]} showCustomModal={() => {}} showToast={() => {}} />);

  // Wait for the lists to render
  await waitFor(() => {
    expect(screen.getByText('My Scenarios')).toBeTruthy();
    expect(screen.getByText('Shared Scenarios')).toBeTruthy();
  });

  // Alice should see her local scenario and the shared one she owns in My Scenarios
  expect(screen.getByText('Alice Local')).toBeTruthy();
  expect(screen.getByText('Alice Shared')).toBeTruthy();

  // Bob's shared scenario should appear under Shared Scenarios and show "Shared by bob"
  expect(screen.getByText('Bob Shared')).toBeTruthy();
  expect(screen.getByText('Shared by bob')).toBeTruthy();

  // There should be at least one Delete button for my scenarios
  expect(screen.getAllByRole('button', { name: /Delete scenario/i }).length).toBeGreaterThanOrEqual(1);

  // The shared Bob scenario should show Read-only badge
  expect(screen.getAllByText('Read-only').length).toBeGreaterThanOrEqual(1);
});
