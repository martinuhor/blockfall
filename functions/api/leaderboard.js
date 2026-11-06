/**
 * Daily leaderboard for Lagos-day runs.
 * GET  /api/leaderboard?date=YYYY-MM-DD
 * POST /api/leaderboard  { handle, seed, inputs, tick, score, bands, hash }
 *
 * Verifies the receipt with the same engine as the client.
 * Persists to LEADERBOARD_KV when bound; otherwise an in-isolate memory store
 * (fine for local preview, not multi-edge durable).
 */

import { json, options, clean } from "../lib/http.js";
import { readBoard, writeBoard, upsertEntry, sanitizeHandle, rankEntries } from "../lib/board.js";
import { lagosDateKey, verifyRun } from "../../js/engine.js";

function kv(env) {
  return env.LEADERBOARD_KV || env.STATS_KV || null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = clean(url.searchParams.get("date") || lagosDateKey(), 32);
  const entries = await readBoard(kv(env), date);
  return json({
    date,
    durable: Boolean(kv(env)),
    entries: rankEntries(entries),
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON receipt." }, 400);
  }

  const handle = sanitizeHandle(body.handle);
  if (!handle) return json({ error: "Pick a handle (letters, numbers, underscore)." }, 400);

  const seed = clean(body.seed, 80);
  const expected = `daily-${lagosDateKey()}`;
  if (seed !== expected) {
    return json({ error: "Only today's Lagos daily run can be ranked.", expected }, 400);
  }

  const inputs = Array.isArray(body.inputs) ? body.inputs : null;
  if (!inputs || inputs.length > 20000) {
    return json({ error: "Inputs missing or too long." }, 400);
  }

  const tick = Number(body.tick);
  const score = Number(body.score);
  const bands = Number(body.bands);
  const hash = clean(body.hash, 64);
  if (!Number.isFinite(tick) || !Number.isFinite(score) || !Number.isFinite(bands) || !hash) {
    return json({ error: "tick, score, bands, and hash are required." }, 400);
  }

  const check = verifyRun(seed, inputs, tick, score, bands, hash);
  if (!check.ok) {
    return json({ error: "Receipt did not replay. It cannot be ranked.", detail: check }, 422);
  }

  const date = lagosDateKey();
  const store = kv(env);
  const current = await readBoard(store, date);
  const prior = current.find((row) => row.handle === handle);
  if (prior && prior.score >= score) {
    return json({
      date,
      durable: Boolean(store),
      kept: prior,
      entries: rankEntries(current),
      message: "Existing score is higher or equal.",
    });
  }

  const next = upsertEntry(current, {
    handle,
    score,
    bands,
    tick,
    hash,
    when: new Date().toISOString(),
  });
  const entries = await writeBoard(store, date, next);
  return json({
    date,
    durable: Boolean(store),
    entries,
    submitted: entries.find((row) => row.handle === handle),
  });
}

export async function onRequestOptions() {
  return options("GET", "POST");
}
