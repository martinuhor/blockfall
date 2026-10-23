// Top-down room. People are drawn here, not loaded from a sprite sheet.
// Chat opens only on the tile beside a guest. Orders keep a near/far band.

import { createBitchat } from "./bitchat.js";
import {
  BAND_KEY,
  bandToStore,
  denialCode,
  errandKind,
  errandLine,
  normalizeBand,
  readingToBand,
} from "./order.js";
import {
  MAP,
  approachTiles,
  counterExit,
  faceName,
  isSolid,
  parseMap,
  pathTo,
  standsNextTo,
} from "./room-map.js";

const TILE = 16;
const MENU = ["Zobo", "Suya", "Chin chin"];
const STEP_MS = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 110;
const WALK_MS = STEP_MS === 0 ? 0 : 160;

const CAST = {
  you: {
    id: "you",
    name: "You",
    guest: false,
    hair: "#24180f",
    skin: "#d7a15e",
    shirt: "#e0a84a",
    pants: "#3a2a22",
    shoe: "#1a120e",
    hairStyle: "short",
  },
  ada: {
    id: "ada",
    name: "Ada",
    guest: true,
    hair: "#1a120e",
    skin: "#8d5524",
    shirt: "#3e7c6f",
    pants: "#241810",
    shoe: "#120e0c",
    hairStyle: "long",
  },
  ngozi: {
    id: "ngozi",
    name: "Ngozi",
    guest: true,
    hair: "#4a2c18",
    skin: "#6f4428",
    shirt: "#8c3d55",
    pants: "#2a2030",
    shoe: "#120e0c",
    hairStyle: "bun",
  },
  chidi: {
    id: "chidi",
    name: "Chidi",
    guest: true,
    hair: "#111111",
    skin: "#4a2912",
    shirt: "#3d5a80",
    pants: "#1c2430",
    shoe: "#0e0c0a",
    hairStyle: "short",
  },
  seyi: {
    id: "seyi",
    name: "Seyi",
    guest: true,
    hair: "#2a1c12",
    skin: "#c68642",
    shirt: "#c46b3a",
    pants: "#2c2418",
    shoe: "#14100c",
    hairStyle: "cap",
  },
};

const SPAWN_ID = { a: "ada", n: "ngozi", c: "chidi" };
const HELLO = {
  ada: "I'm Ada, a person in this room. I take orders at the counter.",
  ngozi: "I'm Ngozi, a person in this room.",
  chidi: "I'm Chidi, a person in this room.",
};
const REPLIES = {
  ngozi: [
    "I'm still in this room. Ada has the counter.",
    "This chat stays here until a real bitchat client is plugged in.",
  ],
  chidi: [
    "Pull up a tile. I'm a person in this room, not a name on a mesh.",
    "If you want something, stand next to Ada.",
  ],
};

const FACE = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const map = parseMap(MAP);
const canvas = document.querySelector("#room-canvas");

function boot(canvasEl) {
  const ctx = canvasEl.getContext("2d");
  const tags = document.querySelector("#tags");
  const chatEl = document.querySelector("#chat");
  const chatName = document.querySelector("#chat-name");
  const logEl = document.querySelector("#log");
  const form = document.querySelector("#say-form");
  const input = document.querySelector("#say");
  const orders = document.querySelector("#orders");
  const status = document.querySelector("#status");
  const note = document.querySelector("#mesh-note");
  const chat = createBitchat();
  const messages = [];
  const greeted = new Set();
  const replyCount = { ngozi: 0, chidi: 0 };
  const tagEls = new Map();
  let memoryBand = null;
  let askInFlight = false;
  let active = null;
  let runner = null;
  let playerAnim = null;

  const guests = Object.entries(SPAWN_ID).map(([key, id]) => {
    const spot = map.spawns[key];
    return actor(CAST[id], spot.x, spot.y, "down");
  });
  const player = actor(CAST.you, map.spawns.p.x, map.spawns.p.y, "up");

  chat.connect().then((link) => {
    note.hidden = false;
    note.textContent = link.local
      ? "Messages are local until a real bitchat client is plugged in."
      : "A bitchat client is connected. People in this room still reply on this page.";
  });

  chat.onMessage((message) => {
    messages.push(message);
    paintLog();
  });

  window.addEventListener("keydown", (event) => {
    const move = FACE_KEY[event.key];
    if (!move) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    event.preventDefault();
    tryStep(move[0], move[1]);
  });

  for (const button of document.querySelectorAll("[data-move]")) {
    const move = FACE_KEY[button.dataset.move];
    if (!move) continue;
    bindHold(button, () => tryStep(move[0], move[1]));
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !active) return;
    input.value = "";
    void chat.send(text, { from: "you", to: active.id });
    if (chat.local) localReply(active.id, text);
  });

  for (const button of orders.querySelectorAll("[data-item]")) {
    button.addEventListener("click", () => choose(button.dataset.item));
  }

  refreshChat();
  let last = performance.now();
  requestAnimationFrame(function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    stepPlayer(now);
    stepRunner(dt);
    draw(ctx);
    syncTags();
    requestAnimationFrame(frame);
  });

  function choose(item) {
    if (!active || active.id !== "ada") return;
    void chat.send(`${item}, please.`, { from: "you", to: "ada" });
    placeOrder(item);
  }

  function placeOrder(item) {
    if (!active || active.id !== "ada") return;
    if (runner || askInFlight) {
      void chat.send("Seyi is already out with an order.", { from: "ada", to: "you" });
      return;
    }
    const existing = readBand();
    if (existing) {
      beginErrand(item, existing, null, false);
      return;
    }
    askInFlight = true;
    paintOrders();
    void chat.send(
      "I'll ask this browser once whether you're under 1.5 km from this room. Only the near or far band is kept for this session. Coordinates are not stored.",
      { from: "ada", to: "you" }
    );
    requestBand((band, deniedCode) => {
      askInFlight = false;
      beginErrand(item, band, deniedCode, true);
    });
  }

  function localReply(id, text) {
    if (id === "ada") {
      const item = MENU.find((entry) => text.toLowerCase().includes(entry.toLowerCase()));
      if (item) {
        placeOrder(item);
        return;
      }
      void chat.send("Pick zobo, suya, or chin chin. I'll ask once for a near or far band.", {
        from: "ada",
        to: "you",
      });
      return;
    }
    const lines = REPLIES[id];
    if (!lines) return;
    const line = lines[replyCount[id] % lines.length];
    replyCount[id] += 1;
    void chat.send(line, { from: id, to: "you" });
  }

  function requestBand(done) {
    if (!navigator.geolocation) {
      remember("far");
      done("far", "unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const band = readingToBand(pos.coords.latitude, pos.coords.longitude);
        remember(band);
        done(band, null);
      },
      (error) => {
        remember("far");
        done("far", denialCode(error));
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 }
    );
  }

  function beginErrand(item, band, deniedCode, fresh) {
    const kind = errandKind(band, { denied: Boolean(deniedCode) });
    const line = errandLine({ kind, item, deniedCode, fresh });
    void chat.send(line, { from: "ada", to: "you" });
    setStatus(line);
    const start = counterExit(map, map.spawns.a, occupied);
    if (!start) {
      void chat.send("Seyi can't step out from the counter.", { from: "ada", to: "you" });
      paintOrders();
      return;
    }
    const goal = kind === "handoff" ? handoffTile(start) : map.door;
    if (!goal) {
      void chat.send("Seyi can't reach you. Step into the open and ask again.", { from: "ada", to: "you" });
      paintOrders();
      return;
    }
    const path = pathTo(map, start, goal, (x, y) => occupied(x, y) && !(x === goal.x && y === goal.y));
    if (!path) {
      void chat.send("Seyi can't find a way through. Step aside and ask again.", { from: "ada", to: "you" });
      paintOrders();
      return;
    }
    runner = actor(CAST.seyi, start.x, start.y, "down");
    runner.carrying = true;
    runner.kind = kind;
    runner.phase = path.length ? "walk" : "arrive";
    runner.path = path;
    runner.goal = goal;
    runner.anim = null;
    runner.wait = 0;
    runner.leave = 0;
    if (!path.length) arrive();
    paintOrders();
  }

  function handoffTile(from) {
    const tiles = approachTiles(map, player, (x, y) => guestAt(x, y));
    let best = null;
    let bestLen = Infinity;
    for (const tile of tiles) {
      const path = pathTo(map, from, tile, (x, y) => occupied(x, y));
      if (!path) continue;
      if (path.length < bestLen) {
        best = tile;
        bestLen = path.length;
      }
    }
    return best;
  }

  function arrive() {
    if (!runner) return;
    if (runner.kind === "handoff" && runner.phase !== "return") {
      runner.phase = "pause";
      runner.wait = WALK_MS === 0 ? 0 : 700;
      runner.face = faceToward(runner, player);
      void chat.send("Seyi is beside you with the order. In-person handoff.", { from: "ada", to: "you" });
      if (runner.wait === 0) startReturn();
      return;
    }
    if (runner.kind === "delivery" && runner.phase !== "return") {
      runner.phase = "leave";
      runner.leave = 0;
      if (WALK_MS === 0) removeRunner();
      return;
    }
    removeRunner();
  }

  function startReturn() {
    if (!runner) return;
    const home = counterExit(map, map.spawns.a, (x, y) => occupied(x, y) && !(runner.x === x && runner.y === y));
    const path = home ? pathTo(map, runner, home, (x, y) => occupied(x, y) && !(x === home.x && y === home.y)) : null;
    if (!path) {
      removeRunner();
      return;
    }
    runner.kind = "return";
    runner.phase = path.length ? "return" : "done";
    runner.path = path;
    runner.anim = null;
    if (!path.length) removeRunner();
  }

  function stepRunner(dt) {
    if (!runner) return;
    runner.frame = Math.floor(performance.now() / 160) % 2;
    if (runner.phase === "pause") {
      runner.wait -= dt;
      if (runner.wait <= 0) startReturn();
      return;
    }
    if (runner.phase === "leave") {
      runner.leave += dt;
      runner.drawY = runner.y + Math.min(1.05, runner.leave / 180);
      if (runner.leave >= 180) removeRunner();
      return;
    }
    if (runner.phase !== "walk" && runner.phase !== "return") return;
    if (!runner.anim) {
      const next = runner.path.shift();
      if (!next) {
        arrive();
        return;
      }
      runner.anim = {
        x: runner.x,
        y: runner.y,
        nx: next.x,
        ny: next.y,
        start: performance.now(),
        dur: Math.max(WALK_MS, 1),
      };
      runner.face = faceName(next.x - runner.x, next.y - runner.y);
      if (WALK_MS === 0) {
        runner.x = next.x;
        runner.y = next.y;
        runner.drawX = next.x;
        runner.drawY = next.y;
        runner.anim = null;
      }
    }
    if (!runner.anim) return;
    const u = Math.min(1, (performance.now() - runner.anim.start) / runner.anim.dur);
    runner.drawX = runner.anim.x + (runner.anim.nx - runner.anim.x) * u;
    runner.drawY = runner.anim.y + (runner.anim.ny - runner.anim.y) * u;
    if (u >= 1) {
      runner.x = runner.anim.nx;
      runner.y = runner.anim.ny;
      runner.drawX = runner.x;
      runner.drawY = runner.y;
      runner.anim = null;
    }
  }

  function removeRunner() {
    runner = null;
    const el = tagEls.get("seyi");
    if (el) {
      el.remove();
      tagEls.delete("seyi");
    }
    paintOrders();
  }

  function retargetRunner() {
    if (!runner || runner.kind !== "handoff" || runner.phase !== "walk") return;
    const goal = handoffTile(runner);
    if (!goal) return;
    if (runner.goal && runner.goal.x === goal.x && runner.goal.y === goal.y) return;
    const path = pathTo(map, runner, goal, (x, y) => occupied(x, y));
    if (!path) return;
    runner.path = path;
    runner.goal = goal;
    runner.anim = null;
  }

  function tryStep(dx, dy) {
    if (playerAnim) return;
    player.face = faceName(dx, dy);
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (isSolid(map, nx, ny) || occupied(nx, ny)) return;
    if (STEP_MS === 0) {
      player.x = nx;
      player.y = ny;
      player.drawX = nx;
      player.drawY = ny;
      player.frame = player.frame ? 0 : 1;
      retargetRunner();
      refreshChat();
      return;
    }
    playerAnim = { x: player.x, y: player.y, nx, ny, start: performance.now() };
  }

  function stepPlayer(now) {
    if (!playerAnim) return;
    const u = Math.min(1, (now - playerAnim.start) / Math.max(STEP_MS, 1));
    player.drawX = playerAnim.x + (playerAnim.nx - playerAnim.x) * u;
    player.drawY = playerAnim.y + (playerAnim.ny - playerAnim.y) * u;
    player.frame = u < 1 ? 1 : 0;
    if (u < 1) return;
    player.x = playerAnim.nx;
    player.y = playerAnim.ny;
    player.drawX = player.x;
    player.drawY = player.y;
    playerAnim = null;
    retargetRunner();
    refreshChat();
  }

  function refreshChat() {
    const next = guestBeside();
    const changed = (next && next.id) !== (active && active.id);
    active = next;
    chatEl.hidden = !active;
    if (!active) {
      if (document.activeElement === input) input.blur();
      logEl.replaceChildren();
      paintOrders();
      return;
    }
    chatName.textContent = active.name;
    if (changed && !greeted.has(active.id)) {
      greeted.add(active.id);
      void chat.send(HELLO[active.id], { from: active.id, to: "you" });
    }
    paintLog();
    paintOrders();
  }

  function paintLog() {
    logEl.replaceChildren();
    if (!active) return;
    for (const message of messages) {
      if (message.from !== active.id && message.to !== active.id) continue;
      const item = document.createElement("li");
      const who = document.createElement("span");
      who.textContent = message.from === "you" ? "You" : CAST[message.from].name;
      const body = document.createElement("p");
      body.textContent = message.text;
      item.append(who, body);
      if (message.from !== "you") {
        const mark = document.createElement("small");
        mark.textContent = "Person in this room";
        item.append(mark);
      }
      logEl.append(item);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function paintOrders() {
    const show = Boolean(active && active.id === "ada" && !runner && !askInFlight);
    orders.hidden = !show;
  }

  function guestBeside() {
    const beside = guests.filter((guest) => standsNextTo(player, guest));
    if (!beside.length) return null;
    const [fx, fy] = FACE[player.face];
    return beside.find((guest) => guest.x === player.x + fx && guest.y === player.y + fy) || beside[0];
  }

  function guestAt(x, y) {
    return guests.some((guest) => guest.x === x && guest.y === y);
  }

  function occupied(x, y) {
    if (guestAt(x, y)) return true;
    if (player.x === x && player.y === y) return true;
    if (runner && runner.phase !== "leave" && runner.x === x && runner.y === y) return true;
    return false;
  }

  function readBand() {
    if (memoryBand) return memoryBand;
    try {
      memoryBand = normalizeBand(sessionStorage.getItem(BAND_KEY));
    } catch {
      memoryBand = null;
    }
    return memoryBand;
  }

  function remember(band) {
    memoryBand = bandToStore(band);
    try {
      sessionStorage.setItem(BAND_KEY, memoryBand);
    } catch {
      // The band still lives in this page if storage is blocked.
    }
  }

  function setStatus(text) {
    status.textContent = text;
  }

  function syncTags() {
    const people = [...guests, player];
    if (runner) people.push(runner);
    for (const person of people) {
      let el = tagEls.get(person.id);
      if (!el) {
        el = document.createElement("p");
        el.className = "who";
        el.dataset.person = person.id;
        const name = document.createElement("b");
        name.textContent = person.name;
        el.append(name);
        if (person.guest) {
          const small = document.createElement("small");
          small.textContent = "Person in this room";
          el.append(small);
        } else {
          el.classList.add("you");
        }
        tags.append(el);
        tagEls.set(person.id, el);
      }
      const x = person.drawX ?? person.x;
      const y = person.drawY ?? person.y;
      const labelY = person.guest ? y : y + 0.95;
      el.style.left = `${((x + 0.5) / map.width) * 100}%`;
      el.style.top = `${(labelY / map.height) * 100}%`;
    }
  }

  function draw(context) {
    context.imageSmoothingEnabled = false;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) drawTile(context, map.tiles[y * map.width + x], x, y);
    }
    const people = [...guests, player];
    if (runner) people.push(runner);
    people.sort((a, b) => a.drawY - b.drawY || a.drawX - b.drawX);
    for (const person of people) drawPerson(context, person);
  }
}

const FACE_KEY = {
  ArrowUp: FACE.up,
  ArrowDown: FACE.down,
  ArrowLeft: FACE.left,
  ArrowRight: FACE.right,
};

function actor(cast, x, y, face) {
  return {
    ...cast,
    x,
    y,
    drawX: x,
    drawY: y,
    face,
    frame: 0,
    carrying: false,
  };
}

function bindHold(button, step) {
  let timer = 0;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = 0;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    step();
    stop();
    timer = setInterval(step, 150);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("pointercancel", stop);
}

function faceToward(from, to) {
  return faceName(Math.sign(to.x - from.x), Math.sign(to.y - from.y) || 1);
}

function drawTile(ctx, tile, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (tile === "#") {
    ctx.fillStyle = "#221820";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#4a342c";
    ctx.fillRect(px, py, TILE, 3);
    ctx.fillStyle = "#120c10";
    ctx.fillRect(px + 2, py + 7, TILE - 4, 2);
    return;
  }
  ctx.fillStyle = (x + y) % 2 === 0 ? "#34261f" : "#3c2c23";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px, py + TILE - 1, TILE, 1);
  if (tile === "d") {
    ctx.fillStyle = "#d9c7a6";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#07060a";
    ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 3);
    ctx.fillStyle = "#e0a84a";
    ctx.fillRect(px + 6, py + 7, 4, 4);
  }
  const below = y + 1 < map.height ? map.tiles[(y + 1) * map.width + x] : "";
  if (tile === "." && below === "d") {
    ctx.fillStyle = "#6b4632";
    ctx.fillRect(px + 3, py + 11, TILE - 6, 4);
  } else if (tile === "C") {
    ctx.fillStyle = "#6b4632";
    ctx.fillRect(px + 1, py + 2, TILE - 2, TILE - 3);
    ctx.fillStyle = "#8d5b3c";
    ctx.fillRect(px + 2, py + 3, TILE - 4, 3);
  } else if (tile === "T") {
    ctx.fillStyle = "#5a3b2a";
    ctx.fillRect(px + 1, py + 2, TILE - 2, TILE - 4);
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(px + 4, py + 5, TILE - 8, TILE - 10);
  } else if (tile === "*") {
    ctx.fillStyle = "#3e2a22";
    ctx.fillRect(px + 5, py + 10, 6, 4);
    ctx.fillStyle = "#2f6b45";
    ctx.fillRect(px + 3, py + 4, 4, 6);
    ctx.fillRect(px + 9, py + 5, 4, 5);
    ctx.fillStyle = "#3e7c6f";
    ctx.fillRect(px + 6, py + 2, 4, 5);
  }
}

function drawPerson(ctx, person) {
  const ox = Math.round(person.drawX * TILE);
  const oy = Math.round(person.drawY * TILE);
  const bob = person.frame ? 1 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(ox + 4, oy + 13, 8, 2);
  const px = (x, y, color, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  px(5, 4, person.skin, 6, 5);
  if (person.hairStyle === "long") {
    px(4, 3, person.hair, 8, 6);
    px(5, 5, person.skin, 6, 3);
  } else if (person.hairStyle === "bun") {
    px(6, 1, person.hair, 4, 2);
    px(4, 3, person.hair, 8, 3);
  } else if (person.hairStyle === "cap") {
    px(4, 2, person.shirt, 8, 2);
    px(5, 4, person.hair, 6, 2);
  } else {
    px(4, 2, person.hair, 8, 3);
  }
  px(4, 9, person.shirt, 8, 3);
  px(3, 9, person.shirt, 1, 3);
  px(12, 9, person.shirt, 1, 3);
  px(5, 12, person.pants, 6, 1);
  const foot = bob ? 1 : 0;
  if (person.face === "left") {
    px(4, 13, person.shoe, 2, 2);
    px(8, 13 - foot, person.shoe, 2, 2);
  } else if (person.face === "right") {
    px(6, 13 - foot, person.shoe, 2, 2);
    px(10, 13, person.shoe, 2, 2);
  } else {
    px(5, 13, person.shoe, 2, 2);
    px(9, 13 - foot, person.shoe, 2, 2);
  }
  if (person.face === "down") {
    px(6, 6, "#1a120e", 1, 1);
    px(9, 6, "#1a120e", 1, 1);
  } else if (person.face === "left") {
    px(5, 6, "#1a120e", 1, 1);
    px(6, 7, person.skin, 1, 1);
  } else if (person.face === "right") {
    px(10, 6, "#1a120e", 1, 1);
  } else {
    px(4, 3, person.hair, 8, 4);
  }
  if (person.carrying) {
    px(12, 10, "#e0a84a", 3, 3);
    px(13, 9, "#d9c7a6", 1, 1);
  }
}

if (canvas) boot(canvas);
