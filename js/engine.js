// Blockfall rules.
// Original on purpose: five small tiles (none are a 4-cell brick), an 8×14
// vessel that narrows, band clears, and no upcoming-tile window.
// The live game and the replay both call step(), so a recorded run can be checked.

export const COLS = 8;
export const ROWS = 14;
export const LOCK_TICKS = 28;
export const MAX_LOCK_RESETS = 6;
const MAX_TICKS = 180000;

function rotateCW(cells) {
  const next = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) next[i] = [cells[i][1], -cells[i][0]];
  return next;
}

function turnKey(cells) {
  return cells
    .map(([x, y]) => `${x},${y}`)
    .sort()
    .join("|");
}

function makeTurns(base) {
  const turns = [];
  const seen = new Set();
  let current = base;
  for (let i = 0; i < 4; i++) {
    const key = turnKey(current);
    if (seen.has(key)) break;
    seen.add(key);
    turns.push(current);
    current = rotateCW(current);
  }
  return turns;
}

export const SHAPES = [
  { name: "Pebble", turns: makeTurns([[0, 0]]) },
  {
    name: "Pair",
    turns: makeTurns([
      [0, 0],
      [1, 0],
    ]),
  },
  {
    name: "Bar",
    turns: makeTurns([
      [-1, 0],
      [0, 0],
      [1, 0],
    ]),
  },
  {
    name: "Elbow",
    turns: makeTurns([
      [0, 0],
      [1, 0],
      [0, 1],
    ]),
  },
  {
    name: "Arch",
    turns: makeTurns([
      [-1, 1],
      [0, 0],
      [1, 1],
    ]),
  },
];

const BAND_POINTS = 25;

export function lagosDateKey(date = new Date()) {
  const lagos = new Date(date.getTime() + 60 * 60 * 1000);
  const y = lagos.getUTCFullYear();
  const m = String(lagos.getUTCMonth() + 1).padStart(2, "0");
  const d = String(lagos.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatLagosDate(key) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

export function hashSeed(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pieceIdFromNumber(seedNumber, n) {
  const size = SHAPES.length;
  const bagIndex = Math.floor(n / size);
  const pos = n % size;
  const rng = mulberry32((seedNumber + Math.imul(bagIndex, 0x9e3779b9)) >>> 0);
  const bag = [0, 1, 2, 3, 4];
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag[pos];
}

export function pieceIdAt(seed, n) {
  return pieceIdFromNumber(hashSeed(String(seed)), n);
}

export function playable(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  if (row >= 12) return col >= 2 && col <= 5;
  if (row >= 10) return col >= 1 && col <= 6;
  return true;
}

export function cellsFor(id, rot, col, row) {
  const turns = SHAPES[id].turns;
  const offsets = turns[rot % turns.length];
  const cells = new Array(offsets.length);
  for (let i = 0; i < offsets.length; i++) {
    cells[i] = [col + offsets[i][0], row + offsets[i][1]];
  }
  return cells;
}

function index(col, row) {
  return row * COLS + col;
}

function fits(state, id, rot, col, row) {
  const cells = cellsFor(id, rot, col, row);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i][0];
    const r = cells[i][1];
    if (c < 0 || c >= COLS) return false;
    if (r >= ROWS) return false;
    if (r < 0) continue;
    if (!playable(c, r)) return false;
    if (state.board[index(c, r)] !== 0) return false;
  }
  return true;
}

export function canMoveDown(state) {
  const p = state.piece;
  if (!p) return false;
  return fits(state, p.id, p.rot, p.col, p.row + 1);
}

function gravityInterval(bands) {
  return Math.max(6, 16 - Math.floor(bands / 2));
}

function spawn(state) {
  const id = pieceIdFromNumber(state.seedNumber, state.nextIndex);
  state.nextIndex += 1;
  if (!fits(state, id, 0, 3, 0)) {
    state.piece = null;
    state.alive = false;
    return;
  }
  state.piece = { id, rot: 0, col: 3, row: 0 };
  state.lock = 0;
  state.lockResets = 0;
  state.grav = 0;
  state.deferLock = false;
}

export function createState(seed) {
  const state = {
    seed: String(seed),
    seedNumber: hashSeed(String(seed)),
    board: new Uint8Array(COLS * ROWS),
    piece: null,
    nextIndex: 0,
    tick: 0,
    score: 0,
    bands: 0,
    combo: 0,
    grav: 0,
    lock: 0,
    lockResets: 0,
    deferLock: false,
    alive: true,
    justCleared: [],
  };
  spawn(state);
  return state;
}

function noteGroundedMove(state) {
  if (canMoveDown(state)) return;
  if (state.lockResets >= MAX_LOCK_RESETS) return;
  state.lock = 0;
  state.lockResets += 1;
  state.deferLock = true;
}

function tryPlace(state, id, rot, col, row) {
  if (!fits(state, id, rot, col, row)) return false;
  state.piece.col = col;
  state.piece.row = row;
  state.piece.rot = rot;
  return true;
}

function nudge(state, dc, dr, drot) {
  const p = state.piece;
  const count = SHAPES[p.id].turns.length;
  const rot = (p.rot + drot + count) % count;
  const tries = drot
    ? [
        [dc, dr],
        [dc - 1, dr],
        [dc + 1, dr],
      ]
    : [[dc, dr]];
  for (let i = 0; i < tries.length; i++) {
    if (tryPlace(state, p.id, rot, p.col + tries[i][0], p.row + tries[i][1])) {
      noteGroundedMove(state);
      return;
    }
  }
}

function lockPiece(state) {
  const p = state.piece;
  const cells = cellsFor(p.id, p.rot, p.col, p.row);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i][1] < 0) {
      state.piece = null;
      state.alive = false;
      return;
    }
  }
  for (let i = 0; i < cells.length; i++) {
    state.board[index(cells[i][0], cells[i][1])] = p.id + 1;
  }
  state.score += cells.length;
  state.piece = null;
  resolveBands(state);
  if (!state.alive) return;
  spawn(state);
}

export function resolveBands(state) {
  const cleared = [];
  for (let guard = 0; guard < ROWS; guard++) {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let slots = 0;
      let filled = 0;
      for (let c = 0; c < COLS; c++) {
        if (!playable(c, r)) continue;
        slots += 1;
        if (state.board[index(c, r)] !== 0) filled += 1;
      }
      if (slots > 0 && filled === slots) rows.push(r);
    }
    if (rows.length === 0) {
      if (guard === 0) state.combo = 0;
      break;
    }
    state.combo = guard + 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let width = 0;
      for (let c = 0; c < COLS; c++) {
        if (!playable(c, r)) continue;
        width += 1;
        state.board[index(c, r)] = 0;
      }
      state.score += width * BAND_POINTS * state.combo;
      state.bands += 1;
      cleared.push(r);
    }
    pack(state);
    if (!state.alive) break;
  }
  state.justCleared = cleared;
}

function pack(state) {
  for (let c = 0; c < COLS; c++) {
    const tiles = [];
    const slots = [];
    for (let r = 0; r < ROWS; r++) {
      if (!playable(c, r)) continue;
      slots.push(r);
      const value = state.board[index(c, r)];
      if (value !== 0) tiles.push(value);
      state.board[index(c, r)] = 0;
    }
    const start = slots.length - tiles.length;
    if (start < 0) {
      state.alive = false;
      return;
    }
    for (let i = 0; i < tiles.length; i++) {
      state.board[index(c, slots[start + i])] = tiles[i];
    }
  }
}

function applyGravity(state) {
  if (!state.piece || !state.alive) return;
  if (canMoveDown(state)) {
    state.lock = 0;
    state.lockResets = 0;
    state.deferLock = false;
    state.grav += 1;
    if (state.grav >= gravityInterval(state.bands)) {
      state.grav = 0;
      state.piece.row += 1;
    }
    return;
  }
  state.grav = 0;
  if (state.deferLock) {
    state.deferLock = false;
    return;
  }
  state.lock += 1;
  if (state.lock >= LOCK_TICKS) lockPiece(state);
}

// "V" is a rewarded continue. It stands in for the tick that topped out:
// the tile stays put, the lock delay restarts, and gravity waits one tick.
function applyContinue(state) {
  state.lock = 0;
  state.lockResets = 0;
  state.deferLock = false;
  state.grav = 0;
  state.tick += 1;
}

// Returns true when this action locked the falling tile.
function applyAction(state, action) {
  if (!state.alive || !state.piece) return false;
  if (action === "L") {
    nudge(state, -1, 0, 0);
    return false;
  }
  if (action === "R") {
    nudge(state, 1, 0, 0);
    return false;
  }
  if (action === "C") {
    nudge(state, 0, 0, 1);
    return false;
  }
  if (action === "S") {
    if (canMoveDown(state)) {
      state.piece.row += 1;
      state.grav = 0;
      return false;
    }
    lockPiece(state);
    return true;
  }
  if (action === "H") {
    while (state.piece && canMoveDown(state)) state.piece.row += 1;
    if (state.piece) lockPiece(state);
    return true;
  }
  return false;
}

export function step(state, actions) {
  state.justCleared = [];
  if (!state.alive) return state.justCleared;
  if (state.tick >= MAX_TICKS) {
    state.alive = false;
    state.piece = null;
    state.tick += 1;
    return state.justCleared;
  }
  const list = actions || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "V") {
      applyContinue(state);
      return state.justCleared;
    }
  }
  for (let i = 0; i < list.length; i++) {
    const locked = applyAction(state, list[i]);
    if (locked || !state.alive) break;
  }
  if (state.alive && state.piece) applyGravity(state);
  state.tick += 1;
  return state.justCleared;
}

function group(inputs) {
  const map = new Map();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input || typeof input.t !== "number" || typeof input.a !== "string") continue;
    let list = map.get(input.t);
    if (!list) {
      list = [];
      map.set(input.t, list);
    }
    list.push(input.a);
  }
  return map;
}

export function stateAfter(seed, inputs, ticks) {
  const state = createState(seed);
  const map = group(inputs || []);
  const n = Math.max(0, ticks | 0);
  for (let t = 0; t < n && state.alive; t++) {
    step(state, map.get(t) || []);
  }
  return state;
}

export function boardHash(state) {
  let h = 2166136261;
  for (let i = 0; i < state.board.length; i++) {
    h ^= state.board[i] + 1;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function verifyRun(seed, inputs, ticks, score, bands, hash) {
  const state = stateAfter(seed, inputs, ticks);
  return {
    ok: state.score === score && state.bands === bands && boardHash(state) === hash,
    score: state.score,
    bands: state.bands,
    hash: boardHash(state),
    tick: state.tick,
    alive: state.alive,
  };
}
