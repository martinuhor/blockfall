/** Daily leaderboard helpers. KV is optional; memory store is for local wrangler only. */

const memory = new Map();

export function todayKey(dateKey) {
  return `daily:${dateKey}`;
}

export function sanitizeHandle(raw) {
  const handle = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16);
  return handle.length >= 2 ? handle : "";
}

export function rankEntries(entries) {
  return [...entries]
    .filter((row) => row && typeof row.score === "number" && row.handle)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.tick !== b.tick) return a.tick - b.tick;
      return String(a.handle).localeCompare(String(b.handle));
    })
    .slice(0, 25)
    .map((row, index) => ({
      rank: index + 1,
      handle: row.handle,
      score: row.score,
      bands: row.bands || 0,
      tick: row.tick || 0,
      when: row.when || null,
    }));
}

export async function readBoard(kv, dateKey) {
  const key = todayKey(dateKey);
  if (kv) {
    const raw = await kv.get(key, "json");
    return Array.isArray(raw) ? raw : [];
  }
  return memory.get(key) || [];
}

export async function writeBoard(kv, dateKey, entries) {
  const key = todayKey(dateKey);
  const next = rankEntries(entries);
  if (kv) {
    await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 14 });
  } else {
    memory.set(key, next);
  }
  return next;
}

export function upsertEntry(entries, next) {
  const without = entries.filter((row) => row.handle !== next.handle);
  without.push(next);
  return without;
}
