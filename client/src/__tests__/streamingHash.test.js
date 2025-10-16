import { performance } from 'perf_hooks';

// replicate small streaming fnv1a used in App.jsx for a micro-benchmark
const fnv1aInit = () => 2166136261 >>> 0;
const fnv1aUpdate = (h, str) => {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};
const fnv1aDigest = (h) => (h >>> 0).toString(16);

function streamingHashForRows(rows, settings) {
  let h = fnv1aInit();
  h = fnv1aUpdate(h, String(settings.method));
  h = fnv1aUpdate(h, '|');
  h = fnv1aUpdate(h, String(settings.monthsOut));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(r.period));
    h = fnv1aUpdate(h, ':');
    h = fnv1aUpdate(h, String(r.total));
  }
  return fnv1aDigest(h);
}

test('streaming hash is reasonably fast on 10k rows', () => {
  const rows = new Array(10000).fill(0).map((_, i) => ({ period: `2020-01-${(i%28)+1}`, total: i }));
  const start = performance.now();
  const h = streamingHashForRows(rows, { method: 'linear', monthsOut: 12 });
  const time = performance.now() - start;
  // Ensure we produced a hash and it took under 200ms on CI/dev
  expect(typeof h).toBe('string');
  expect(time).toBeLessThan(200);
});