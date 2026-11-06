/**
 * Privacy-light analytics beacon.
 * POST /api/event { name, props? }
 * Counts land in STATS_KV (or LEADERBOARD_KV) under stats:YYYY-MM-DD.
 */

import { json, options, clean } from "../lib/http.js";
import { lagosDateKey } from "../../js/engine.js";

const ALLOWED = new Set([
  "splash_view",
  "play_daily",
  "play_practice",
  "run_finish",
  "ost_play",
  "merch_open",
  "merch_checkout",
  "room_open",
  "board_view",
]);

function store(env) {
  return env.STATS_KV || env.LEADERBOARD_KV || null;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON required" }, 400);
  }

  const name = clean(body.name, 40);
  if (!ALLOWED.has(name)) return json({ error: "Unknown event" }, 400);

  const kv = store(env);
  const day = lagosDateKey();
  if (kv) {
    const key = `stats:${day}`;
    const current = (await kv.get(key, "json")) || { date: day, counts: {} };
    current.counts[name] = (current.counts[name] || 0) + 1;
    current.updated = new Date().toISOString();
    await kv.put(key, JSON.stringify(current), { expirationTtl: 60 * 60 * 24 * 40 });
  }

  return json({ ok: true, recorded: Boolean(kv) });
}

export async function onRequestOptions() {
  return options("POST");
}
