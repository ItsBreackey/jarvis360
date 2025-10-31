import { mergeAndPersistScenarios, STORAGE_KEY } from '../scenarioPersistence';

describe('mergeAndPersistScenarios', () => {
  beforeEach(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  });

  test('persists incoming when storage empty', () => {
    const incoming = [{ id: 'opt-1', title: 'A', updatedAt: '2025-01-01T00:00:00.000Z' }];
    const out = mergeAndPersistScenarios(incoming, 'test1');
    expect(out.length).toBe(1);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored[0].id).toBe('opt-1');
  });

  test('replaces optimistic with server confirm (serverId)', () => {
    // initial optimistic saved
    mergeAndPersistScenarios([{ id: 'opt-2', title: 'B', updatedAt: '2025-01-01T00:00:00.000Z' }], 'init');
    // server confirm arrives with serverId and same id
    const serverItem = { id: 'opt-2', serverId: '555', title: 'B', updatedAt: '2025-01-02T00:00:00.000Z' };
  mergeAndPersistScenarios([serverItem], 'server-confirm');
    // ensure only server key exists
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.length).toBe(1);
    expect(stored[0].serverId).toBe('555');
    expect(stored[0].id).toBe('opt-2');
  });

  test('preserves newer incoming over older existing', () => {
    // existing older
    mergeAndPersistScenarios([{ id: 's1', title: 'Old', updatedAt: '2024-12-01T00:00:00.000Z' }], 'init');
    const incoming = [{ id: 's1', title: 'New', updatedAt: '2025-02-01T00:00:00.000Z' }];
  mergeAndPersistScenarios(incoming, 'update');
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored[0].title).toBe('New');
  });

  test('orders incoming first then existing', () => {
    // existing list
    mergeAndPersistScenarios([
      { id: 'e1', title: 'E1', updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'e2', title: 'E2', updatedAt: '2025-01-01T00:00:00.000Z' },
    ], 'init');

    const incoming = [ { id: 'i1', title: 'I1', updatedAt: '2025-02-01T00:00:00.000Z' } ];
    const out = mergeAndPersistScenarios(incoming, 'incoming');
    expect(out[0].id).toBe('i1');
    expect(out.findIndex(x => x.id === 'e1')).toBeGreaterThan(0);
  });

  test('caps list at 50', () => {
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ id: `n${i}`, title: `N${i}`, updatedAt: `2025-01-${(i%28)+1}T00:00:00.000Z` });
    const out = mergeAndPersistScenarios(many, 'large');
    expect(out.length).toBeLessThanOrEqual(50);
  });
});
