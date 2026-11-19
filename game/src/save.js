// Local persistence for Palm Bay Heat. Storage can be unavailable (private windows, file://),
// so every access is guarded and the game simply starts fresh when it is.

const KEY = 'palm-bay-heat-save-v1';

/** A fresh defaults object on every call — callers are free to mutate their copy. */
function defaults() {
  return { money: 0, storyIndex: 0, rampageBest: 0 };
}

export function loadSave() {
  const save = defaults();
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return save;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return save;
    // Merge only the known numeric fields; ignore anything else in an old or edited save.
    for (const field of ['money', 'storyIndex', 'rampageBest']) {
      const value = parsed[field];
      if (typeof value === 'number' && Number.isFinite(value)) save[field] = value;
    }
  } catch {
    // Bad JSON or blocked storage: keep the defaults.
  }
  return save;
}

export function storeSave(save) {
  try {
    const data = {
      money: save.money,
      storyIndex: save.storyIndex,
      rampageBest: save.rampageBest,
    };
    globalThis.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage may be disabled; progress then lasts only for this visit.
  }
}
