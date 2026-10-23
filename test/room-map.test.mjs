import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP,
  approachTiles,
  counterExit,
  parseMap,
  pathTo,
  standsNextTo,
} from "../js/room-map.js";

test("the room has a door and the guests are not already beside you", () => {
  const map = parseMap(MAP);
  assert.equal(map.width, 16);
  assert.equal(map.height, 12);
  assert.ok(map.door);
  const you = map.spawns.p;
  for (const key of ["a", "n", "c"]) {
    assert.equal(standsNextTo(you, map.spawns[key]), false);
    assert.ok(approachTiles(map, map.spawns[key]).length > 0);
  }
});

test("a runner can leave by the door and can walk to the player", () => {
  const map = parseMap(MAP);
  const start = counterExit(map, map.spawns.a);
  assert.ok(start);
  assert.equal(standsNextTo(start, map.spawns.a), true);
  const toDoor = pathTo(map, start, map.door);
  assert.ok(toDoor && toDoor.length > 0);
  assert.deepEqual(toDoor[toDoor.length - 1], map.door);
  const beside = approachTiles(map, map.spawns.p)[0];
  const toPlayer = pathTo(map, start, beside);
  assert.ok(toPlayer && toPlayer.length > 0);
  assert.equal(standsNextTo(toPlayer[toPlayer.length - 1], map.spawns.p), true);
});

test("chat range is the next tile, not a neighbor two away", () => {
  assert.equal(standsNextTo({ x: 3, y: 4 }, { x: 4, y: 4 }), true);
  assert.equal(standsNextTo({ x: 3, y: 4 }, { x: 5, y: 4 }), false);
  assert.equal(standsNextTo({ x: 3, y: 4 }, { x: 4, y: 5 }), false);
});
