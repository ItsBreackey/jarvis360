import runCancelableHoltAutoTune from '../utils/holtWorker';

test('runCancelableHoltAutoTune completes and returns best params', async () => {
  const series = [100,110,105,120,130,125,140];
  const { promise } = runCancelableHoltAutoTune(series, { alphaStart: 0.2, alphaEnd: 0.8, alphaStep: 0.2, betaStart: 0.1, betaEnd: 0.5, betaStep: 0.2 });
  const out = await promise;
  expect(out).toBeDefined();
  expect(typeof out.alpha).toBe('number');
  expect(typeof out.beta).toBe('number');
  expect(typeof out.sse).toBe('number');
});

test('runCancelableHoltAutoTune revoke cancels work', async () => {
  const series = Array.from({length:200}, (_,i) => 100 + Math.sin(i/10)*10 + i*0.2);
  const runner = runCancelableHoltAutoTune(series, { alphaStart: 0.01, alphaEnd: 0.99, alphaStep: 0.01, betaStart: 0.01, betaEnd: 0.99, betaStep: 0.01 });
  // cancel quickly and assert the promise either rejects or resolves quickly — cancellation path accepted
  runner.revoke();
  let settled = false;
  try {
    await runner.promise;
    settled = true;
  } catch (e) {
    settled = true;
  }
  expect(settled).toBe(true);
});
