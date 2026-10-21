import test from "node:test";
import assert from "node:assert/strict";
import {
  COLS,
  ROWS,
  SHAPES,
  boardHash,
  canMoveDown,
  createState,
  hashSeed,
  lagosDateKey,
  pieceIdAt,
  playable,
  resolveBands,
  stateAfter,
  step,
  verifyRun,
} from "../js/engine.js";

test("each later turn is one quarter-turn of the one before it", () => {
  function quarter(cells) {
    return cells
      .map(([x, y]) => [y, -x])
      .sort()
      .map((cell) => cell.join(","));
  }
  for (const shape of SHAPES) {
    for (let i = 1; i < shape.turns.length; i++) {
      const got = shape.turns[i].map((cell) => cell.slice()).sort().map((cell) => cell.join(","));
      assert.deepEqual(got, quarter(shape.turns[i - 1]));
    }
  }
});

test("the vessel is not a 10 by 20 rectangle", () => {
  assert.equal(COLS, 8);
  assert.equal(ROWS, 14);
  assert.equal(playable(0, 0), true);
  assert.equal(playable(0, 9), true);
  assert.equal(playable(0, 10), false);
  assert.equal(playable(1, 10), true);
  assert.equal(playable(1, 12), false);
  assert.equal(playable(2, 13), true);
  assert.equal(playable(7, 13), false);
});

test("tiles are the five original shapes, and none has four cells", () => {
  assert.equal(SHAPES.length, 5);
  assert.deepEqual(
    SHAPES.map((shape) => shape.name),
    ["Pebble", "Pair", "Bar", "Elbow", "Arch"],
  );
  for (const shape of SHAPES) {
    for (const turn of shape.turns) assert.notEqual(turn.length, 4);
  }
});

test("a seed deals tiles in bags that contain each shape once", () => {
  const seed = "daily-2026-10-21";
  const first = Array.from({ length: 30 }, (_, i) => pieceIdAt(seed, i));
  const second = Array.from({ length: 30 }, (_, i) => pieceIdAt(seed, i));
  assert.deepEqual(first, second);
  for (let bag = 0; bag < 6; bag++) {
    const ids = first.slice(bag * 5, bag * 5 + 5).slice().sort((a, b) => a - b);
    assert.deepEqual(ids, [0, 1, 2, 3, 4]);
  }
  assert.notEqual(hashSeed("daily-2026-10-21"), hashSeed("practice-1"));
});

test("Lagos day is UTC+1 with no daylight saving shift", () => {
  assert.equal(lagosDateKey(new Date("2026-10-21T22:30:00.000Z")), "2026-10-21");
  assert.equal(lagosDateKey(new Date("2026-10-21T23:30:00.000Z")), "2026-10-22");
});

test("a wide tile rests on the ledge and a center tile can enter the neck", () => {
  const side = createState("ledge");
  side.piece = { id: 2, rot: 0, col: 1, row: 9 };
  assert.equal(canMoveDown(side), false);

  const neck = createState("ledge");
  neck.piece = { id: 0, rot: 0, col: 3, row: 9 };
  assert.equal(canMoveDown(neck), true);

  const grounded = createState("ledge-lock");
  grounded.piece = { id: 0, rot: 0, col: 0, row: 9 };
  for (let i = 0; i < 35; i++) step(grounded, []);
  assert.notEqual(grounded.board[9 * COLS + 0], 0);
  assert.equal(grounded.alive, true);
});

test("a clear in the neck can chain when tiles drop into it", () => {
  const state = createState("chain");
  state.piece = null;
  for (let c = 2; c <= 5; c++) state.board[13 * COLS + c] = 1;
  for (let c = 2; c <= 5; c++) state.board[11 * COLS + c] = 2;
  resolveBands(state);
  assert.equal(state.bands, 2);
  assert.equal(state.score, 300);
  assert.equal(state.board[13 * COLS + 2], 0);
  assert.equal(state.board[11 * COLS + 2], 0);
  assert.deepEqual(state.justCleared, [13, 13]);
});

test("side tiles fall onto the ledge instead of into the neck", () => {
  const state = createState("pack");
  state.piece = null;
  state.board[4 * COLS + 0] = 3;
  for (let c = 0; c < COLS; c++) state.board[5 * COLS + c] = 1;
  resolveBands(state);
  assert.equal(state.bands, 1);
  assert.equal(state.score, 200);
  assert.equal(state.board[9 * COLS + 0], 3);
  assert.equal(state.board[4 * COLS + 0], 0);
});

test("the same inputs replay to the same score, bands, and vessel", () => {
  const seed = "daily-2026-10-21";
  const script = [
    { t: 2, a: "L" },
    { t: 4, a: "C" },
    { t: 6, a: "H" },
    { t: 8, a: "R" },
    { t: 8, a: "R" },
    { t: 10, a: "H" },
    { t: 20, a: "C" },
    { t: 22, a: "S" },
    { t: 24, a: "H" },
  ];
  const live = createState(seed);
  const map = new Map();
  for (const input of script) {
    if (!map.has(input.t)) map.set(input.t, []);
    map.get(input.t).push(input.a);
  }
  for (let i = 0; i < 90 && live.alive; i++) step(live, map.get(i) || []);
  const replay = stateAfter(seed, script, live.tick);
  assert.equal(replay.score, live.score);
  assert.equal(replay.bands, live.bands);
  assert.equal(boardHash(replay), boardHash(live));
  assert.equal(replay.tick, live.tick);
  assert.deepEqual(replay.piece, live.piece);

  const check = verifyRun(seed, script, live.tick, live.score, live.bands, boardHash(live));
  assert.equal(check.ok, true);
});

test("a changed score fails the replay check", () => {
  const seed = "daily-2026-10-21";
  const inputs = [{ t: 0, a: "H" }];
  const live = stateAfter(seed, inputs, 1);
  const forged = verifyRun(seed, inputs, live.tick, live.score + 50, live.bands, boardHash(live));
  assert.equal(forged.ok, false);
  assert.equal(forged.score, live.score);
});

test("a continue replaces the killing tick and keeps the vessel", () => {
  const seed = "practice-end";
  const inputs = [];
  const live = createState(seed);
  let guard = 0;
  while (live.alive && guard < 80) {
    inputs.push({ t: live.tick, a: "H" });
    step(live, ["H"]);
    guard += 1;
  }
  assert.equal(live.alive, false);
  const deathTick = live.tick - 1;
  const prior = inputs.filter((input) => input.t < deathTick);
  const before = stateAfter(seed, prior, deathTick);
  const resumed = prior.concat([{ t: deathTick, a: "V" }]);
  const state = stateAfter(seed, resumed, deathTick + 1);
  assert.equal(state.alive, true);
  assert.equal(state.tick, deathTick + 1);
  assert.equal(state.score, before.score);
  assert.equal(state.bands, before.bands);
  assert.equal(boardHash(state), boardHash(before));
  assert.equal(state.lock, 0);
  assert.deepEqual(
    [state.piece.id, state.piece.rot, state.piece.col, state.piece.row],
    [before.piece.id, before.piece.rot, before.piece.col, before.piece.row],
  );

  const grace = createState("grace");
  grace.lock = 10;
  grace.grav = 5;
  const parked = { ...grace.piece };
  const parkedHash = boardHash(grace);
  step(grace, ["V", "H"]);
  assert.equal(grace.tick, 1);
  assert.equal(grace.lock, 0);
  assert.equal(grace.grav, 0);
  assert.equal(boardHash(grace), parkedHash);
  assert.deepEqual(grace.piece, parked);

  const more = resumed.slice();
  for (let i = 0; i < 3 && state.alive; i++) {
    more.push({ t: state.tick, a: "L" });
    step(state, ["L"]);
  }
  const check = verifyRun(seed, more, state.tick, state.score, state.bands, boardHash(state));
  assert.equal(check.ok, true);
});

test("hard drops end the run and the replay still matches", () => {
  const seed = "practice-end";
  const inputs = [];
  const live = createState(seed);
  let guard = 0;
  while (live.alive && guard < 80) {
    inputs.push({ t: live.tick, a: "H" });
    step(live, ["H"]);
    guard += 1;
  }
  assert.equal(live.alive, false);
  assert.ok(live.score > 0);
  const check = verifyRun(seed, inputs, live.tick, live.score, live.bands, boardHash(live));
  assert.equal(check.ok, true);
});
