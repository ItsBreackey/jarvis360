import { generateScenarioSummary } from '../utils/summarizer';

test('generateScenarioSummary returns a string for results', () => {
	const s = generateScenarioSummary({ projectedMRRSaved: 1234 }, {});
	expect(typeof s).toBe('string');
	expect(s.length).toBeGreaterThan(0);
});

