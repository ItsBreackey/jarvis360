import React from 'react';

// Reusable helpers originally in App.jsx
export const calculateChurnRiskScore = (customer) => {
  const { MRR, churnProbability, supportTickets, lastActivityDays } = customer;
  const weightProbability = 0.5;
  const weightTickets = 0.2;
  const weightActivity = 0.2;
  const weightMRR = 0.1;
  let probRisk = parseFloat(churnProbability) || 0;
  let ticketRisk = Math.min((parseFloat(supportTickets) || 0) / 10, 1);
  let activityRisk = Math.min((parseFloat(lastActivityDays) || 0) / 60, 1);
  let mrrRisk = 1 - Math.min((parseFloat(MRR) || 0) / 2000, 1);
  const score = (
    (probRisk * weightProbability) +
    (ticketRisk * weightTickets) +
    (activityRisk * weightActivity) +
    (mrrRisk * weightMRR)
  ) * 100;
  return Math.max(0, Math.min(100, score));
};

export const formatCurrency = (amount) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  } catch (e) { return String(amount); }
};

export const InfoIcon = ({ title, srText }) => (
  <span className="inline-flex items-center ml-2" title={title} aria-hidden="false">
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="10" width="2" height="6" fill="currentColor" />
      <rect x="11" y="7" width="2" height="2" fill="currentColor" />
    </svg>
    <span className="sr-only">{srText || title}</span>
  </span>
);

// html2canvas helpers (deferred loader)
let _html2canvasPromise = null;
export const ensureHtml2Canvas = () => {
  if (_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = (async () => {
    try {
      const mod = await import('html2canvas');
      return mod.default || mod;
    } catch (e) {
      if (typeof window.html2canvas !== 'undefined') return window.html2canvas;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = () => resolve();
        s.onerror = (err) => reject(err);
        document.head.appendChild(s);
      });
      return window.html2canvas;
    }
  })();
  return _html2canvasPromise;
};

export const exportElementToPng = async (el, filename = 'chart.png', scale = 2) => {
  if (!el) return false;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(el, { scale: Math.max(1, scale), useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff' });
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        resolve(true);
      }, 'image/png');
    });
  } catch (e) {
    console.error('exportElementToPng failed', e);
    return false;
  }
};

export const copyElementToClipboard = async (el, scale = 2) => {
  if (!el || !navigator.clipboard) return false;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(el, { scale: Math.max(1, scale), useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff' });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return false;
    const clipboardItem = new window.ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch (e) {
    console.error('copyElementToClipboard failed', e);
    return false;
  }
};

export const NoDataMessage = () => (
  <div className="text-center py-16 text-xl text-gray-500 font-medium border border-dashed border-gray-300 rounded-xl bg-white shadow-inner">
    <p className="mb-4">No customer data loaded.</p>
    <p className="text-base text-gray-400">Please go to the <strong>Data Dashboard</strong> tab to load data from a CSV file or seed sample data.</p>
  </div>
);

const appShared = {
  calculateChurnRiskScore,
  formatCurrency,
  InfoIcon,
  exportElementToPng,
  copyElementToClipboard,
  NoDataMessage,
};

export default appShared;
