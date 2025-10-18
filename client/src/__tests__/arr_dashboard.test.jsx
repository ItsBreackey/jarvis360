// Prevent Recharts ResponsiveContainer from requiring layout in JSDOM tests.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => React.createElement('div', { style: { width: 800, height: 200 } }, children),
  };
});

// jsdom doesn't implement ResizeObserver which Recharts' ResponsiveContainer expects.
// Provide a lightweight stub for tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  if (typeof global.ResizeObserver === 'undefined') global.ResizeObserver = ResizeObserverStub;
});

// Now require React and testing helpers after mocks have been registered
const React = require('react');
const { render, screen } = require('@testing-library/react');
const { ArrView } = require('../App.jsx');

test('renders ARR Dashboard summary and cohort table', () => {
  const records = [
    { customer_id: 'a', mrr: 100, signup_date: '2025-01-05' },
    { customer_id: 'b', mrr: 200, signup_date: '2025-01-20' },
  ];
  render(React.createElement(ArrView, { records }));
  expect(screen.getByText(/ARR Dashboard/i)).toBeTruthy();
  // check for cohort table header and a top-customer entry
  expect(screen.getByText(/Cohort table \(signup-month\)/i)).toBeTruthy();
  expect(screen.getByText('b')).toBeTruthy();
});
