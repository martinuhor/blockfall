import test from "node:test";
import assert from "node:assert/strict";
import { rankEntries, sanitizeHandle, upsertEntry } from "../functions/lib/board.js";

test("sanitizeHandle keeps short safe handles", () => {
  assert.equal(sanitizeHandle("Ada_Ok"), "ada_ok");
  assert.equal(sanitizeHandle("!!"), "");
  assert.equal(sanitizeHandle("a"), "");
  assert.equal(sanitizeHandle("VeryLongHandleNameHere"), "verylonghandlena");
});

test("rankEntries sorts by score then tick then handle", () => {
  const ranked = rankEntries([
    { handle: "b", score: 100, tick: 50 },
    { handle: "a", score: 100, tick: 40 },
    { handle: "c", score: 120, tick: 90 },
  ]);
  assert.deepEqual(
    ranked.map((row) => row.handle),
    ["c", "a", "b"],
  );
  assert.equal(ranked[0].rank, 1);
});

test("upsertEntry replaces the same handle", () => {
  const next = upsertEntry(
    [{ handle: "ada", score: 10, tick: 1 }],
    { handle: "ada", score: 40, tick: 2 },
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].score, 40);
});
