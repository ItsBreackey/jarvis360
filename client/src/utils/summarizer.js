// Simple local heuristic summarizer for scenarios
// Produces a short 3-line summary for a given simulationResults and whatIfData
export function generateScenarioSummary(simulationResults, whatIfData) {
  if (!simulationResults) return '';
  const { targetCustomerCount, projectedMRRSaved, currentTotalMRR } = simulationResults;
  const pct = currentTotalMRR > 0 ? Math.round((projectedMRRSaved / currentTotalMRR) * 100) : 0;
  const lines = [];
  lines.push(`${targetCustomerCount} customers targeted; estimated MRR saved ≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(projectedMRRSaved)} (${pct}% of current MRR).`);

  const main = Object.entries(whatIfData || {}).sort((a,b) => b[1] - a[1])[0];
  if (main) {
    const keyMap = { discountEffect: 'Discounts', supportEffect: 'Support', campaignEffect: 'Re-engagement' };
    lines.push(`Primary lever: ${keyMap[main[0]] || main[0]} set to ${Math.round(main[1]*100)}%.`);
  }
  lines.push('Recommended actions: prioritize top-risk customers, apply targeted offers, and monitor outcomes weekly.');
  return lines.join(' ');
}
