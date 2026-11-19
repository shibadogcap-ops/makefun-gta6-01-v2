// Seeded randomness. All simulation randomness must flow through these generators,
// so a given seed always produces the same world and the same repeatable scenes.

/** mulberry32: a compact, fast, well-distributed 32-bit PRNG. */
export function makeRng(seed) {
  let a = seed >>> 0;

  function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(a, b) {
      return a + next() * (b - a);
    },
    int(a, b) {
      return a + Math.floor(next() * (b - a));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}

/** FNV-1a string hash, returned as an unsigned 32-bit integer. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
