import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import TimeSeriesForecast from '../pages/TimeSeriesForecast';

// Mock the shared export helpers so we don't invoke html2canvas or clipboard
jest.mock('../lib/appShared', () => ({
  exportElementToPng: jest.fn(() => Promise.resolve(true)),
  copyElementToClipboard: jest.fn(() => Promise.resolve(true)),
  formatCurrency: (v) => String(v),
}));

describe('Chart export buttons and chartRef behavior', () => {
  test('Download/Copy buttons disabled when chartRef.current is null and enabled when set', async () => {
  // Start with no ref (simulate caller not providing a ref yet)
  const props = { chartRef: null, monthlySeries: [], records: [], showCustomModal: jest.fn(), showToast: jest.fn(), showToastRef: { current: null }, showCustomModalRef: { current: null } };

  const { rerender } = render(<TimeSeriesForecast {...props} />);

    const downloadBtn = screen.getByRole('button', { name: /Download forecast image/i });
    const copyBtn = screen.getByRole('button', { name: /Copy forecast image to clipboard/i });

  // Initially disabled because chartRef.current is null
  expect(downloadBtn.disabled).toBe(true);
  expect(copyBtn.disabled).toBe(true);

  // Provide a plain ref-like object whose .current points to an existing DOM node (simulate caller-created container)
  const node = document.createElement('div');
  document.body.appendChild(node);
  const chartRefObj = { current: node };
  rerender(<TimeSeriesForecast {...{ ...props, chartRef: chartRefObj }} />);

  // Now the buttons should be enabled
  expect(screen.getByRole('button', { name: /Download forecast image/i }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: /Copy forecast image to clipboard/i }).disabled).toBe(false);

  // Click the buttons and assert the mocked helpers are invoked
  const { exportElementToPng, copyElementToClipboard } = require('../lib/appShared');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Download forecast image/i })); });
  expect(exportElementToPng).toHaveBeenCalled();
  const downloadArg = exportElementToPng.mock.calls[0][0];
  expect(downloadArg).toBeInstanceOf(HTMLElement);

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy forecast image to clipboard/i })); });
  expect(copyElementToClipboard).toHaveBeenCalled();
  const copyArg = copyElementToClipboard.mock.calls[0][0];
  expect(copyArg).toBeInstanceOf(HTMLElement);
  });
});
