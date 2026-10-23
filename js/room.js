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
  tileAt,
  pathTo,
  standsNextTo,
} from "./room-map.js";

const TILE = 32;
const MENU = ["Zobo", "Suya", "Chin chin"];
const STEP_MS = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 110;
const WALK_MS = STEP_MS === 0 ? 0 : 160;

const CAST = {
  you: {
    id: "you",
    name: "You",
    guest: false,
    hair: "#24180f",
    skin: "#e0b56a",
    shirt: "#f0b429",
    pants: "#3a2a22",
    shoe: "#1a120e",
    hairStyle: "short",
  },
  ada: {
    id: "ada",
    name: "Ada",
    guest: true,
    hair: "#1a120e",
    skin: "#a86b38",
    shirt: "#1f9d8a",
    pants: "#241810",
    shoe: "#120e0c",
    hairStyle: "long",
  },
  ngozi: {
    id: "ngozi",
    name: "Ngozi",
    guest: true,
    hair: "#4a2c18",
    skin: "#8a4b2f",
    shirt: "#e25b86",
    pants: "#2a2030",
    shoe: "#120e0c",
    hairStyle: "bun",
  },
  chidi: {
    id: "chidi",
    name: "Chidi",
    guest: true,
    hair: "#111111",
    skin: "#6b3a22",
    shirt: "#3c7dd6",
    pants: "#1c2430",
    shoe: "#0e0c0a",
    hairStyle: "short",
  },
  seyi: {
    id: "seyi",
    name: "Seyi",
    guest: true,
    hair: "#2a1c12",
    skin: "#d09a58",
    shirt: "#e07a3d",
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
  canvasEl.width = map.width * TILE;
  canvasEl.height = map.height * TILE;
  const ctx = canvasEl.getContext("2d");
  const tags = document.querySelector("#tags");
  const bubbles = document.querySelector("#bubbles");
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
  const bubbleEls = new Map();
  let memoryBand = null;
  let askInFlight = false;
  let active = null;
  let runner = null;

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
    const passTo = otherGuestNamed(text, active.id);
    void chat.send(text, { from: "you", to: active.id });
    if (passTo) {
      void chat.send(`I'll walk that over to ${CAST[passTo].name}.`, { from: active.id, to: "you" });
      beginCarry(active, text, passTo);
      return;
    }
    if (chat.local) localReply(active.id, text);
  });

  for (const button of orders.querySelectorAll("[data-item]")) {
    button.addEventListener("click", () => choose(button.dataset.item));
  }

  refreshChat();
  paint();
  let last = performance.now();
  requestAnimationFrame(function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    try {
      stepPlayer(now);
      stepGuests(now, dt);
      stepRunner(dt);
    } catch (error) {
      console.error(error);
    }
    paint();
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
    if (player.anim) return;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (isSolid(map, nx, ny) || occupied(nx, ny, player.id)) return;
    startMove(player, nx, ny, STEP_MS);
    if (STEP_MS === 0) {
      retargetRunner();
      refreshChat();
    }
  }

  function stepPlayer(now) {
    if (!player.anim) {
      if (STEP_MS !== 0) player.frame = Math.floor(now / 480) % 2;
      return;
    }
    if (tickMove(player, now)) return;
    retargetRunner();
    refreshChat();
  }

  function stepGuests(now, dt) {
    stepCouriers(now, dt);
    for (const guest of guests) {
      if (guest.courier) continue;
      if (guest.anim) {
        if (!tickMove(guest, now)) refreshChat();
        continue;
      }
      if (guest.id === "ada") {
        if (STEP_MS !== 0) guest.frame = Math.floor(now / 480 + 1) % 2;
        continue;
      }
      if (standsNextTo(player, guest)) {
        guest.nextWander = now + 700;
        if (STEP_MS !== 0) guest.frame = Math.floor(now / 480 + guest.x) % 2;
        continue;
      }
      if (now < guest.nextWander) {
        if (STEP_MS !== 0) guest.frame = Math.floor(now / 480 + guest.x) % 2;
        continue;
      }
      guest.nextWander = now + 1100 + Math.random() * 1600;
      const options = approachTiles(map, guest, (x, y) => tileAt(map, x, y) !== "." || occupied(x, y, guest.id));
      if (!options.length) continue;
      const next = options[Math.floor(Math.random() * options.length)];
      startMove(guest, next.x, next.y, STEP_MS);
    }
  }

  function beginCarry(guest, text, toId) {
    if (!guest || guest.courier) return;
    guest.anim = null;
    guest.drawX = guest.x;
    guest.drawY = guest.y;
    const recipient = guests.find((person) => person.id === toId);
    if (!recipient) return;
    const home = { x: guest.x, y: guest.y };
    guest.carrying = true;
    if (standsNextTo(guest, recipient)) {
      guest.courier = { text, toId, phase: "deliver", path: [], home, wait: STEP_MS === 0 ? 0 : 1100, goal: { x: guest.x, y: guest.y } };
      guest.face = faceToward(guest, recipient);
      void chat.send(text, { from: guest.id, to: toId });
      setStatus(`${guest.name} is beside ${recipient.name} with that message.`);
      if (STEP_MS === 0) startReturn(guest);
      return;
    }
    const goal = nearestApproach(guest, recipient);
    if (!goal) {
      guest.carrying = false;
      void chat.send("I can't get through. The way is blocked.", { from: guest.id, to: "you" });
      return;
    }
    const path = pathTo(map, guest, goal, (x, y) => occupied(x, y, guest.id) && !(x === goal.x && y === goal.y));
    if (!path) {
      guest.carrying = false;
      void chat.send("I can't get through. The way is blocked.", { from: guest.id, to: "you" });
      return;
    }
    guest.courier = {
      text,
      toId,
      phase: path.length ? "walk" : "deliver",
      path,
      home,
      wait: STEP_MS === 0 ? 0 : 1100,
      goal,
    };
    guest.anim = null;
    setStatus(`${guest.name} is walking that message to ${CAST[toId].name}.`);
    if (!path.length) {
      guest.courier.phase = "deliver";
      void chat.send(text, { from: guest.id, to: toId });
      if (STEP_MS === 0) startReturn(guest);
    }
  }

  function nearestApproach(from, target) {
    const tiles = approachTiles(map, target, (x, y) => tileAt(map, x, y) !== "." || occupied(x, y, from.id));
    let best = null;
    let bestLen = Infinity;
    for (const tile of tiles) {
      const path = pathTo(map, from, tile, (x, y) => occupied(x, y, from.id) && !(x === tile.x && y === tile.y));
      if (!path) continue;
      if (path.length < bestLen) {
        best = tile;
        bestLen = path.length;
      }
    }
    return best;
  }

  function startReturn(guest) {
    const job = guest.courier;
    if (!job) return;
    guest.carrying = false;
    if (guest.x === job.home.x && guest.y === job.home.y) {
      finishCarry(guest);
      return;
    }
    const homeFree = tileAt(map, job.home.x, job.home.y) === "." && !occupied(job.home.x, job.home.y, guest.id);
    if (!homeFree) {
      finishCarry(guest);
      return;
    }
    const path = pathTo(map, guest, job.home, (x, y) => occupied(x, y, guest.id) && !(x === job.home.x && y === job.home.y));
    if (!path) {
      finishCarry(guest);
      return;
    }
    job.phase = "return";
    job.path = path;
    job.goal = job.home;
    if (!path.length) finishCarry(guest);
  }

  function finishCarry(guest) {
    guest.courier = null;
    guest.carrying = false;
    guest.anim = null;
  }

  function stepCouriers(now, dt) {
    for (const guest of guests) {
      const job = guest.courier;
      if (!job) continue;
      if (guest.anim) {
        if (!tickMove(guest, now)) refreshChat();
        continue;
      }
      if (job.phase === "deliver") {
        const recipient = guests.find((person) => person.id === job.toId);
        if (recipient) guest.face = faceToward(guest, recipient);
        job.wait -= dt;
        if (job.wait <= 0) startReturn(guest);
        continue;
      }
      if (job.phase !== "walk" && job.phase !== "return") continue;
      const next = job.path.shift();
      if (!next) {
        if (job.phase === "walk") {
          job.phase = "deliver";
          job.wait = STEP_MS === 0 ? 0 : 1100;
          const recipient = guests.find((person) => person.id === job.toId);
          if (recipient) guest.face = faceToward(guest, recipient);
          void chat.send(job.text, { from: guest.id, to: job.toId });
          setStatus(`${guest.name} handed that message to ${CAST[job.toId].name}.`);
          if (job.wait === 0) startReturn(guest);
        } else {
          finishCarry(guest);
        }
        continue;
      }
      if (occupied(next.x, next.y, guest.id)) {
        if (job.phase !== "walk") {
          finishCarry(guest);
          continue;
        }
        const recipient = guests.find((person) => person.id === job.toId);
        const goal = recipient ? nearestApproach(guest, recipient) : null;
        const path = goal
          ? pathTo(map, guest, goal, (x, y) => occupied(x, y, guest.id) && !(x === goal.x && y === goal.y))
          : null;
        if (!goal || !path) {
          void chat.send("I can't get through. The way is blocked.", { from: guest.id, to: "you" });
          finishCarry(guest);
          continue;
        }
        job.goal = goal;
        job.path = path;
        continue;
      }
      startMove(guest, next.x, next.y, STEP_MS);
    }
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

  function bodyAt(person, x, y) {
    if (!person) return false;
    if (person.x === x && person.y === y) return true;
    return Boolean(person.anim && person.anim.nx === x && person.anim.ny === y);
  }

  function guestAt(x, y) {
    return guests.some((guest) => bodyAt(guest, x, y));
  }

  function occupied(x, y, ignoreId) {
    if (guests.some((guest) => guest.id !== ignoreId && bodyAt(guest, x, y))) return true;
    if (player.id !== ignoreId && bodyAt(player, x, y)) return true;
    if (runner && runner.id !== ignoreId && runner.phase !== "leave" && bodyAt(runner, x, y)) return true;
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
      el.style.left = `${((x + 0.5) / map.width) * 100}%`;
      el.style.top = `${(y / map.height) * 100}%`;
    }
  }

  function syncBubbles() {
    if (!bubbles) return;
    const specs = [];
    if (active) {
      const last = [...messages].reverse().find((message) => message.from === active.id || message.to === active.id);
      specs.push({
        key: `talk-${active.id}`,
        person: active,
        text: last ? clipLine(last.text) : HELLO[active.id],
      });
    }
    for (const guest of guests) {
      const job = guest.courier;
      if (!job) continue;
      if (job.phase === "deliver") {
        const recipient = guests.find((person) => person.id === job.toId);
        if (!recipient) continue;
        specs.push({
          key: `drop-${guest.id}`,
          person: recipient,
          text: clipLine(`${guest.name}: ${job.text}`),
        });
      } else if (job.phase === "walk") {
        specs.push({
          key: `carry-${guest.id}`,
          person: guest,
          text: clipLine(`For ${CAST[job.toId].name}: ${job.text}`),
        });
      }
    }
    const keep = new Set();
    for (const spec of specs) {
      keep.add(spec.key);
      let el = bubbleEls.get(spec.key);
      if (!el) {
        el = document.createElement("p");
        el.className = "bubble";
        bubbles.append(el);
        bubbleEls.set(spec.key, el);
      }
      el.textContent = spec.text;
      const x = spec.person.drawX ?? spec.person.x;
      const y = spec.person.drawY ?? spec.person.y;
      el.style.left = `${((x + 0.5) / map.width) * 100}%`;
      el.style.top = `${(y / map.height) * 100}%`;
    }
    for (const [key, el] of bubbleEls) {
      if (keep.has(key)) continue;
      el.remove();
      bubbleEls.delete(key);
    }
  }

  function paint() {
    draw(ctx);
    syncTags();
    syncBubbles();
  }

  function draw(context) {
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#e7d3b0";
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
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
    courier: null,
    anim: null,
    nextWander: performance.now() + 900 + x * 220,
  };
}

function clipLine(text) {
  const line = String(text).replace(/\s+/g, " ").trim();
  return line.length > 110 ? `${line.slice(0, 107)}...` : line;
}

function otherGuestNamed(text, exceptId) {
  const lower = String(text).toLowerCase();
  return ["ada", "ngozi", "chidi"].find((id) => id !== exceptId && new RegExp(`\\b${id}\\b`).test(lower)) || null;
}

function startMove(person, nx, ny, dur) {
  person.face = faceName(nx - person.x, ny - person.y);
  if (dur <= 0) {
    person.x = nx;
    person.y = ny;
    person.drawX = nx;
    person.drawY = ny;
    person.frame = person.frame ? 0 : 1;
    person.anim = null;
    return;
  }
  person.anim = { x: person.x, y: person.y, nx, ny, start: performance.now(), dur };
  person.frame = 1;
}

function tickMove(person, now) {
  const anim = person.anim;
  if (!anim) return false;
  const u = Math.min(1, (now - anim.start) / Math.max(anim.dur, 1));
  person.drawX = anim.x + (anim.nx - anim.x) * u;
  person.drawY = anim.y + (anim.ny - anim.y) * u;
  person.frame = u < 0.5 ? 1 : 0;
  if (u < 1) return true;
  person.x = anim.nx;
  person.y = anim.ny;
  person.drawX = person.x;
  person.drawY = person.y;
  person.anim = null;
  return false;
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
    ctx.fillStyle = "#6d5648";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#3e2e28";
    ctx.fillRect(px, py + 15, TILE, 2);
    const seam = (y % 2) * 16;
    ctx.fillRect(px + seam, py, 2, 15);
    ctx.fillRect(px + ((seam + 16) % 32), py + 17, 2, 15);
    ctx.fillStyle = "#b89a86";
    ctx.fillRect(px + 4, py + 3, TILE - 8, 5);
    ctx.fillStyle = "#8b6d5c";
    ctx.fillRect(px + 4, py + 19, TILE - 8, 4);
    return;
  }
  const light = (x + y) % 2 === 0;
  ctx.fillStyle = "#7a5a3a";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = light ? "#f4e3c6" : "#e2c79a";
  ctx.fillRect(px + 2, py + 2, TILE - 3, TILE - 3);
  ctx.fillStyle = light ? "#d7b88a" : "#c9a36e";
  ctx.fillRect(px + 6, py + 6, 5, 5);
  if ((x * 3 + y) % 5 === 0) {
    ctx.fillStyle = "#c48a55";
    ctx.fillRect(px + 20, py + 18, 4, 4);
  }
  if (tile === "d") {
    ctx.fillStyle = "#6d5648";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#f7edd8";
    ctx.fillRect(px + 5, py, TILE - 10, TILE);
    ctx.fillStyle = "#3b2418";
    ctx.fillRect(px + 8, py + 3, TILE - 16, TILE - 3);
    ctx.fillStyle = "#e0a84a";
    ctx.fillRect(px + 20, py + 16, 4, 4);
    ctx.fillStyle = "#f7edd8";
    ctx.fillRect(px + 5, py, TILE - 10, 4);
    return;
  }
  const below = y + 1 < map.height ? map.tiles[(y + 1) * map.width + x] : "";
  if (tile === "." && below === "d") {
    ctx.fillStyle = "#8d3d32";
    ctx.fillRect(px + 6, py + 22, TILE - 12, 6);
    ctx.fillStyle = "#c46b5a";
    ctx.fillRect(px + 8, py + 23, TILE - 16, 3);
  } else if (tile === "C") {
    ctx.fillStyle = "#8d5a32";
    ctx.fillRect(px + 2, py + 8, TILE - 4, TILE - 12);
    ctx.fillStyle = "#e0a15a";
    ctx.fillRect(px + 2, py + 4, TILE - 4, 8);
    ctx.fillStyle = "#f6e2bc";
    ctx.fillRect(px + 6, py + 6, TILE - 12, 3);
  } else if (tile === "T") {
    ctx.fillStyle = "#6b442c";
    ctx.fillRect(px + 7, py + 20, 4, 8);
    ctx.fillRect(px + TILE - 11, py + 20, 4, 8);
    ctx.fillStyle = "#f0ddb4";
    ctx.fillRect(px + 3, py + 8, TILE - 6, 14);
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(px + 3, py + 8, TILE - 6, 3);
  } else if (tile === "*") {
    ctx.fillStyle = "#c47a3a";
    ctx.fillRect(px + 11, py + 20, 10, 8);
    ctx.fillStyle = "#8d4e28";
    ctx.fillRect(px + 13, py + 18, 6, 3);
    ctx.fillStyle = "#1f7a3a";
    ctx.fillRect(px + 6, py + 12, 9, 8);
    ctx.fillStyle = "#3cb56a";
    ctx.fillRect(px + 15, py + 10, 10, 8);
    ctx.fillStyle = "#145c32";
    ctx.fillRect(px + 10, py + 4, 8, 8);
  }
}

function drawPerson(ctx, person) {
  const ox = Math.round(person.drawX * TILE);
  const oy = Math.round(person.drawY * TILE);
  const bob = person.frame ? -2 : 0;
  const lift = person.frame ? 2 : 0;
  const y0 = oy + bob;
  const ink = "#2a160c";
  const box = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, y0 + y, w, h);
  };
  ctx.fillStyle = "rgba(42, 22, 12, 0.28)";
  ctx.fillRect(ox + 8, oy + 26, 16, 4);
  box(8, 5, 16, 20, ink);
  if (person.face === "left") {
    box(9, 21, 5, 4, person.pants);
    box(16, 21 - lift, 5, 4, person.pants);
    box(9, 24, 5, 3, person.shoe);
    box(16, 24 - lift, 5, 3, person.shoe);
  } else if (person.face === "right") {
    box(11, 21 - lift, 5, 4, person.pants);
    box(18, 21, 5, 4, person.pants);
    box(11, 24 - lift, 5, 3, person.shoe);
    box(18, 24, 5, 3, person.shoe);
  } else {
    box(10, 21, 5, 4, person.pants);
    box(17, 21, 5, 4, person.pants);
    box(10, 24 - (person.face === "up" ? 0 : lift), 5, 3, person.shoe);
    box(17, 24, 5, 3, person.shoe);
  }
  box(8, 13, 16, 9, person.shirt);
  box(6, 14, 3, 6, person.shirt);
  box(23, 14, 3, 6, person.shirt);
  box(8, 20, 16, 2, ink);
  box(9, 6, 14, 8, person.skin);
  if (person.hairStyle === "long") {
    box(8, 4, 16, 6, person.hair);
    box(8, 10, 3, 8, person.hair);
    box(21, 10, 3, 8, person.hair);
    box(11, 8, 10, 5, person.skin);
  } else if (person.hairStyle === "bun") {
    box(12, 1, 8, 4, person.hair);
    box(8, 4, 16, 4, person.hair);
  } else if (person.hairStyle === "cap") {
    box(8, 3, 16, 4, "#f0d7a2");
    box(7, 6, 18, 2, "#f0d7a2");
    box(10, 7, 12, 2, person.hair);
  } else {
    box(8, 4, 16, 4, person.hair);
  }
  if (person.face === "down") {
    box(12, 9, 2, 2, ink);
    box(18, 9, 2, 2, ink);
    box(15, 12, 2, 1, "#8d3d32");
  } else if (person.face === "left") {
    box(11, 9, 2, 2, ink);
    box(10, 12, 3, 1, "#8d3d32");
  } else if (person.face === "right") {
    box(19, 9, 2, 2, ink);
    box(19, 12, 3, 1, "#8d3d32");
  } else {
    box(8, 5, 16, 7, person.hair);
  }
  if (person.carrying) {
    if (person.courier) {
      box(22, 15, 8, 7, "#fff8ea");
      box(23, 17, 6, 1, ink);
      box(23, 19, 4, 1, ink);
    } else {
      box(22, 16, 7, 6, "#e0a84a");
      box(24, 15, 3, 2, "#fff8ea");
    }
  }
}

if (canvas) boot(canvas);
