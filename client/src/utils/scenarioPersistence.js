// Shared persistence helpers for saved scenarios
export const STORAGE_KEY = 'jarvis_saved_scenarios_v1';

export const readSavedScenarios = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const persistScenarios = (list) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
};

// Merge-and-persist: read existing storage, merge by id/serverId picking the newest
// item (by updatedAt) and then write. This prevents stale-list overwrites from
// other writers stomping optimistic inserts.
export const mergeAndPersistScenarios = (incomingList, source = 'unknown') => {
  try {
    const nowRaw = localStorage.getItem(STORAGE_KEY);
    let existing = [];
    try { existing = nowRaw ? JSON.parse(nowRaw) : []; } catch (e) { existing = []; }

    // normalize items: ensure updatedAt exists
    const norm = (arr) => (arr || []).map(item => ({ ...item, updatedAt: item.updatedAt || item.createdAt || new Date().toISOString() }));
    const incoming = norm(incomingList || []);
    const present = norm(existing || []);

    // index by canonical key: prefer serverId -> srv-{id} key else local id
    const keyOf = (it) => (it.serverId ? `srv-${it.serverId}` : (it.id || null));

    const mergedMap = new Map();
    // put existing
    for (const it of present) {
      const k = keyOf(it);
      if (!k) continue;
      mergedMap.set(k, it);
    }

    // Build an index of existing items by their local id (for optimistic items)
    const presentById = new Map();
    for (const it of present) {
      if (it && it.id) presentById.set(it.id, it);
    }

    // merge incoming, prefer item with later updatedAt
    for (const it of incoming) {
      // If incoming has a serverId but also carries the same local optimistic id,
      // prefer the server-backed canonical key and remove the optimistic-keyed entry
      // to avoid duplicating the item (counts like 21->22).
      if (it && it.serverId && it.id) {
        // find existing optimistic item keyed by that same id
        const optimistic = presentById.get(it.id);
        if (optimistic) {
          const optKey = keyOf(optimistic);
          try { if (optKey && mergedMap.has(optKey)) mergedMap.delete(optKey); } catch (e) {}
        }
      }

      const k = keyOf(it);
      if (!k) continue;
      const prev = mergedMap.get(k);
      if (!prev) { mergedMap.set(k, it); continue; }
      try {
        const prevT = new Date(prev.updatedAt).getTime() || 0;
        const curT = new Date(it.updatedAt).getTime() || 0;
        if (curT >= prevT) mergedMap.set(k, it);
      } catch (e) { mergedMap.set(k, it); }
    }

    // produce ordered list: incoming items first (preserve caller intent ordering), then remaining existing items
    const incomingKeys = (incoming || []).map(keyOf).filter(Boolean);
    const finalList = [];
    const added = new Set();
    for (const k of incomingKeys) {
      const it = mergedMap.get(k);
      if (it) { finalList.push(it); added.add(k); }
    }
    for (const [k, it] of mergedMap) {
      if (added.has(k)) continue;
      finalList.push(it);
    }

    // cap list and write
    const out = finalList.slice(0, 50);
    console.debug('[WhatIf] persistScenarios', { source, count: out.length });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    return out;
  } catch (e) {
    console.debug('[WhatIf] mergeAndPersistScenarios failed', e);
    return incomingList || [];
  }
};

export const debugPersistScenarios = (list, source = 'unknown') => mergeAndPersistScenarios(list, source);
