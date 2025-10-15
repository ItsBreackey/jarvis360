import { generateScenarioSummary } from '../utils/summarizer';

test('summarizer produces concise summary', () => {
  const simulationResults = { targetCustomerCount: 10, projectedMRRSaved: 5000, currentTotalMRR: 50000 };
  const whatIfData = { discountEffect: 0.1, supportEffect: 0.05, campaignEffect: 0.15, selectedRiskLevel: 'High' };
  const s = generateScenarioSummary(simulationResults, whatIfData);
  expect(typeof s).toBe('string');
  expect(s.length).toBeGreaterThan(10);
  expect(s).toContain('10 customers');
});
