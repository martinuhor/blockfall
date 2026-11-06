/**
 * Private artist / studio counters.
 * GET /api/stats  Authorization: Bearer <STATS_VIEW_KEY>
 */

import { json, options, text } from "../lib/http.js";
import { lagosDateKey } from "../../js/engine.js";

function store(env) {
  return env.STATS_KV || env.LEADERBOARD_KV || null;
}

export async function onRequestGet({ request, env }) {
  const expected = env.STATS_VIEW_KEY;
  if (!expected) return json({ error: "STATS_VIEW_KEY is not configured." }, 503);

  const header = request.headers.get("authorization") || "";
  const query = new URL(request.url).searchParams.get("key") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : query;
  if (!token || token !== expected) return text("unauthorized", 401);

  const kv = store(env);
  if (!kv) return json({ error: "No STATS_KV / LEADERBOARD_KV binding." }, 503);

  const day = lagosDateKey();
  const today = (await kv.get(`stats:${day}`, "json")) || { date: day, counts: {} };
  return json({ today, note: "Counts are Lagos-day buckets from /api/event." });
}

export async function onRequestOptions() {
  return options("GET");
}
