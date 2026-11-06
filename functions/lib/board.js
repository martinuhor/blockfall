/** Daily leaderboard helpers.
 * Prefer LEADERBOARD_KV when bound; otherwise Cloudflare Cache API
 * (no dashboard binding required). Memory is last-resort for local tests.
 */

const memory = new Map();

export function todayKey(dateKey) {
  return `daily:${dateKey}`;
}

export function cacheRequest(dateKey) {
  return new Request(`https://blockfall-board.internal/daily/${encodeURIComponent(dateKey)}`);
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

async function readCache(dateKey) {
  try {
    if (typeof caches === "undefined" || !caches.default) return null;
    const hit = await caches.default.match(cacheRequest(dateKey));
    if (!hit) return null;
    const raw = await hit.json();
    return Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeCache(dateKey, entries) {
  try {
    if (typeof caches === "undefined" || !caches.default) return false;
    const body = JSON.stringify(entries);
    await caches.default.put(
      cacheRequest(dateKey),
      new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=1209600",
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function readBoard(kv, dateKey) {
  const key = todayKey(dateKey);
  if (kv) {
    const raw = await kv.get(key, "json");
    return Array.isArray(raw) ? raw : [];
  }
  const cached = await readCache(dateKey);
  if (cached) return cached;
  return memory.get(key) || [];
}

export async function writeBoard(kv, dateKey, entries) {
  const key = todayKey(dateKey);
  const next = rankEntries(entries);
  if (kv) {
    await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 14 });
    return { entries: next, durable: true, store: "kv" };
  }
  const cached = await writeCache(dateKey, next);
  memory.set(key, next);
  return { entries: next, durable: cached, store: cached ? "cache" : "memory" };
}

export function upsertEntry(entries, next) {
  const without = entries.filter((row) => row.handle !== next.handle);
  without.push(next);
  return without;
}
