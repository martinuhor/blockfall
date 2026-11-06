// Top-down room. Letters mark people and the door. Everything else is floor or furniture.
// a Ada, n Ngozi, c Chidi, p player, d door.
// # wall, C counter, T table, * plant.

export const MAP = [
  "################",
  "#*.............#",
  "#..CCCCC.......#",
  "#..CCCCC.a.....#",
  "#..............#",
  "#..............#",
  "#..n..TTTT.c...#",
  "#..............#",
  "#..............#",
  "#......p.......#",
  "#..............#",
  "######d#########",
];

const SOLID = new Set(["#", "C", "T", "*"]);
const SPAWNS = new Set(["a", "n", "c", "p"]);
const KNOWN = new Set([...SOLID, ...SPAWNS, ".", "d"]);
const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const EXIT_ORDER = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
];

export function parseMap(rows = MAP) {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = new Array(width * height);
  const spawns = {};
  let door = null;
  for (let y = 0; y < height; y++) {
    if (rows[y].length !== width) throw new Error("Map rows must be the same width.");
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (!KNOWN.has(ch)) throw new Error(`Unknown map tile ${ch}`);
      if (SPAWNS.has(ch)) spawns[ch] = { x, y };
      if (ch === "d") door = { x, y };
      tiles[y * width + x] = SOLID.has(ch) ? ch : ch === "d" ? "d" : ".";
    }
  }
  for (const key of SPAWNS) {
    if (!spawns[key]) throw new Error(`Map is missing ${key}`);
  }
  if (!door) throw new Error("Map is missing a door");
  return { width, height, tiles, spawns, door };
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "#";
  return map.tiles[y * map.width + x];
}

export function isSolid(map, x, y) {
  const tile = tileAt(map, x, y);
  return tile !== "." && tile !== "d";
}

export function standsNextTo(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function approachTiles(map, origin, blocked = () => false) {
  const tiles = [];
  for (const [dx, dy] of DIRS) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (!isSolid(map, x, y) && !blocked(x, y)) tiles.push({ x, y });
  }
  return tiles;
}

export function counterExit(map, origin, blocked = () => false) {
  for (const [dx, dy] of EXIT_ORDER) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (!isSolid(map, x, y) && !blocked(x, y)) return { x, y };
  }
  return null;
}

export function pathTo(map, start, goal, blocked = () => false) {
  if (!start || !goal) return null;
  if (start.x === goal.x && start.y === goal.y) return [];
  const key = (x, y) => y * map.width + x;
  const prev = new Map();
  const queue = [start];
  prev.set(key(start.x, start.y), null);
  let found = false;
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === goal.x && cur.y === goal.y) {
      found = true;
      break;
    }
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const id = key(x, y);
      if (prev.has(id)) continue;
      const atGoal = x === goal.x && y === goal.y;
      if (atGoal) {
        if (isSolid(map, x, y)) continue;
      } else if (isSolid(map, x, y) || blocked(x, y)) {
        continue;
      }
      prev.set(id, cur);
      queue.push({ x, y });
    }
  }
  if (!found) return null;
  const steps = [];
  let cur = goal;
  while (cur && !(cur.x === start.x && cur.y === start.y)) {
    steps.push({ x: cur.x, y: cur.y });
    cur = prev.get(key(cur.x, cur.y));
  }
  steps.reverse();
  return steps;
}

export function faceName(dx, dy) {
  if (dx < 0) return "left";
  if (dx > 0) return "right";
  if (dy < 0) return "up";
  return "down";
}
