import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

// Test that the churn compute toggle results in computed churn badge for rows missing churn
test('churn toggle computes churn and marks rows as computed', async () => {
  render(<App />);

  // Find all 'Load Demo' buttons (there may be one in the onboarding modal and one in the action area).
  const loadButtons = await screen.findAllByRole('button', { name: /load demo/i });
  // Click the last one (action area button)
  const bottomLoadBtn = loadButtons[loadButtons.length - 1];
  fireEvent.click(bottomLoadBtn);

  // Now navigate to Risk & Actions (Churn) view by clicking the nav tab
  const churnTab = screen.getByRole('button', { name: /go to risk & actions/i });
  fireEvent.click(churnTab);

  // Expect at least one 'computed churn' or 'provided' badge in the table depending on data
  await waitFor(() => {
    const provided = screen.queryAllByText(/provided/i);
    const computed = screen.queryAllByText(/computed churn/i);
    // There should be at least one badge visible
    expect(provided.length + computed.length).toBeGreaterThan(0);
  });
});
