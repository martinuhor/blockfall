import {
  boardHash,
  createState,
  formatLagosDate,
  lagosDateKey,
  stateAfter,
  step,
  verifyRun,
} from "./engine.js";
import { createRenderer, DEFAULT_EMOJIS } from "./draw.js";
import { createAds } from "./ads.js";
import { createMusic, trackLine, ARTIST } from "./music.js";

const TICK_MS = 50;
const REPEAT_EVERY = 4;

const board = document.querySelector("#board");
const stage = document.querySelector("#stage");
const renderer = createRenderer(board);
const pads = [...document.querySelectorAll("[data-action]")];

const els = {
  date: document.querySelector("#date"),
  mode: document.querySelector("#mode"),
  stop: document.querySelector("#stop"),
  mute: document.querySelector("#mute"),
  nowPlaying: document.querySelector("#now-playing"),
  score: document.querySelector("#score"),
  bands: document.querySelector("#bands"),
  best: document.querySelector("#best"),
  status: document.querySelector("#status"),
  stats: document.querySelector("#stats"),
  top: document.querySelector("#top"),
  stage,
  splash: document.querySelector("#splash"),
  splashDate: document.querySelector("#splash-date"),
  mark: document.querySelector("#splash-token"),
  splashSponsor: document.querySelector("#splash-sponsor"),
  openPlay: document.querySelector("#open-play"),
  sheet: document.querySelector("#start-sheet"),
  sponsor: document.querySelector("#sponsor-line"),
  playPractice: document.querySelector("#play-practice"),
  playDaily: document.querySelector("#play-daily"),
  controls: document.querySelector("#controls"),
  pause: document.querySelector("#pause"),
  resume: document.querySelector("#resume"),
  endRun: document.querySelector("#end-run"),
  result: document.querySelector("#result"),
  resultKicker: document.querySelector("#result-kicker"),
  resultTitle: document.querySelector("#result-title"),
  resultScore: document.querySelector("#result-score"),
  resultBands: document.querySelector("#result-bands"),
  resultHash: document.querySelector("#result-hash"),
  resultMeta: document.querySelector("#result-meta"),
  resultNote: document.querySelector("#result-note"),
  watchContinue: document.querySelector("#watch-continue"),
  watchDouble: document.querySelector("#watch-double"),
  again: document.querySelector("#result-again"),
  other: document.querySelector("#result-other"),
  home: document.querySelector("#result-home"),
  ad: document.querySelector("#ad"),
  adSponsor: document.querySelector("#ad-sponsor"),
  adMessage: document.querySelector("#ad-message"),
  adReward: document.querySelector("#ad-reward"),
  adCount: document.querySelector("#ad-count"),
  adCancel: document.querySelector("#ad-cancel"),
};

const KEYS = {
  ArrowLeft: "L",
  ArrowRight: "R",
  ArrowDown: "S",
  ArrowUp: "C",
  x: "C",
  X: "C",
  " ": "H",
};

const hold = { L: false, R: false, S: false };
const tap = { L: false, R: false, S: false };
const arm = { L: 0, R: 0 };
const once = [];

let screen = "splash";
let glyphs = DEFAULT_EMOJIS.slice();
let spinTime = 0;
let mode = "ready";
let seed = "";
let state = null;
let inputs = [];
let playing = false;
let paused = false;
let doubled = false;
let shownPoints = 0;
let liveReceipt = null;
let adBusy = false;
let last = 0;
let acc = 0;

const points = new Intl.NumberFormat("en-NG");

const ads = createAds({
  storage: localStorage,
  dateKey: lagosDateKey,
  paint: paintAd,
  clear: clearAd,
});

const music = createMusic(document.querySelector("#ost"), (track) => {
  if (!track) {
    els.nowPlaying.hidden = true;
    els.nowPlaying.textContent = "";
    return;
  }
  els.nowPlaying.hidden = false;
  els.nowPlaying.replaceChildren();
  const title = document.createElement("span");
  title.className = "now-title";
  title.textContent = trackLine(track);
  const artist = document.createElement("span");
  artist.className = "now-artist";
  artist.textContent = ARTIST;
  els.nowPlaying.append(title, artist);
});

function paintMute() {
  const label = music.isMuted() ? "Unmute" : "Mute";
  els.mute.textContent = label;
  els.mute.setAttribute("aria-pressed", music.isMuted() ? "true" : "false");
}

function dailyKey() {
  return `blockfall.daily.${lagosDateKey()}`;
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function today() {
  return readJson(dailyKey());
}

function bestScore() {
  const n = Number(localStorage.getItem("blockfall.practice.best"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function rememberBest(award) {
  if (!(award > bestScore())) return;
  try {
    localStorage.setItem("blockfall.practice.best", String(award));
  } catch {
    /* The phone can refuse storage. The run still ends. */
  }
}

function dailyLabel() {
  const saved = today();
  if (saved && saved.status === "done") return "Today's receipt";
  if (saved && saved.status === "open") return "Continue today's run";
  return "Start today's run";
}

function continued(list) {
  return Array.isArray(list) && list.some((input) => input && input.a === "V");
}

function resetPointers() {
  hold.L = false;
  hold.R = false;
  hold.S = false;
  tap.L = false;
  tap.R = false;
  tap.S = false;
  arm.L = 0;
  arm.R = 0;
  once.length = 0;
}

function syncPads() {
  const on = playing && !paused;
  for (const pad of pads) pad.disabled = !on;
}

function setPlaying(on) {
  playing = on;
  if (!on) {
    paused = false;
    resetPointers();
  }
  syncPads();
}

function glyph(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const parts = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
    for (const part of parts) return part.segment || fallback;
  }
  return Array.from(text)[0] || fallback;
}

const RETIRED_EMOJIS = new Set(["🌈", "📐"]);

function loadGlyphs() {
  const saved = readJson("blockfall.emojis");
  const stale = Array.isArray(saved) && saved.some((item) => RETIRED_EMOJIS.has(glyph(item, "")));
  if (!Array.isArray(saved) || stale) {
    glyphs = DEFAULT_EMOJIS.slice();
    if (stale) saveGlyphs();
  } else {
    glyphs = DEFAULT_EMOJIS.map((fallback, i) => glyph(saved[i], fallback));
  }
  renderer.setEmojis(glyphs);
}

function saveGlyphs() {
  writeJson("blockfall.emojis", glyphs);
  renderer.setEmojis(glyphs);
}

function fillEmojiInputs() {
  const inputs = document.querySelectorAll("[data-emoji]");
  for (const input of inputs) input.value = glyphs[Number(input.dataset.emoji)] || "";
}

function renderHud() {
  const label = formatLagosDate(lagosDateKey());
  els.date.textContent = label;
  els.splashDate.textContent = label;
  const value = screen === "result" ? shownPoints : state ? state.score : 0;
  els.score.textContent = points.format(value);
  els.bands.textContent = String(state ? state.bands : 0);
  const best = bestScore();
  els.best.textContent = best ? points.format(best) : "—";
  if (state) {
    board.dataset.tick = String(state.tick);
    board.dataset.row = state.piece ? String(state.piece.row) : "none";
    board.dataset.col = state.piece ? String(state.piece.col) : "none";
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function layout() {
  renderer.layout(stage.clientWidth, stage.clientHeight);
  if (state) renderer.draw(state);
}

function setScreen(next) {
  screen = next;
  const play = next === "play";
  const pausing = next === "pause";
  const splash = next === "splash";
  const start = next === "start";
  const result = next === "result";
  els.splash.hidden = !splash;
  els.sheet.hidden = !start;
  els.pause.hidden = !pausing;
  els.result.hidden = !result;
  els.top.hidden = splash || start;
  els.stage.hidden = !(play || pausing);
  els.stats.hidden = !(play || pausing);
  els.status.hidden = splash || start;
  els.controls.hidden = !play;
  els.stop.hidden = !play;
  els.mode.hidden = play;
  if (start) els.mode.textContent = "Ready";
  else if (pausing) els.mode.textContent = "Paused";
  else if (result) els.mode.textContent = mode === "daily" ? "Daily" : "Practice";
  document.body.dataset.screen = next;
}

function paintAd(view) {
  els.ad.hidden = false;
  els.adSponsor.textContent = view.sponsor;
  els.adMessage.textContent = view.message;
  els.adReward.textContent = `Reward: ${view.reward}`;
  els.adCount.textContent = String(view.seconds);
  els.adCancel.onclick = () => view.cancel();
}

function clearAd() {
  els.ad.hidden = true;
  els.adCancel.onclick = null;
}

function showSplash() {
  music.stop();
  setPlaying(false);
  liveReceipt = null;
  setScreen("splash");
  const line = ads.line();
  els.splashSponsor.textContent = line;
  els.sponsor.textContent = line;
  renderHud();
}

function showStart() {
  if (adBusy) return;
  clearAd();
  setPlaying(false);
  setScreen("start");
  els.playDaily.textContent = dailyLabel();
  const line = ads.line();
  els.sponsor.textContent = line;
  els.splashSponsor.textContent = line;
  fillEmojiInputs();
  renderHud();
}

function noteFor(receipt) {
  const lines = [];
  if (receipt.ok === false) lines.push("This run did not replay, so it cannot count.");
  else if (mode === "daily") {
    lines.push(
      receipt.stored === false
        ? "The receipt could not be saved on this phone."
        : "Saved on this phone. A server can replay the shared day and these moves.",
    );
  } else {
    lines.push(`Best practice on this phone: ${points.format(bestScore())}. Practice is not ranked.`);
  }
  if (receipt.continued || continued(receipt.inputs)) lines.push("A continue was used.");
  if (receipt.doubled) {
    lines.push(
      `Doubled from ${points.format(receipt.score || 0)}. The replay checks the score before that bonus.`,
    );
  }
  lines.push("Prizes are not paid from this build.");
  return lines.join(" ");
}

function syncRewardButtons() {
  const continueLeft = ads.remaining("continue") > 0;
  const doubleLeft = ads.remaining("double") > 0 && !doubled;
  const offerContinue = !!state && !state.alive && !doubled;
  els.watchContinue.hidden = !offerContinue;
  els.watchContinue.textContent = continueLeft ? "Watch to continue" : "Continue used today";
  els.watchContinue.setAttribute("aria-disabled", continueLeft ? "false" : "true");
  els.watchDouble.textContent = doubleLeft ? "Watch to double this run's points" : "Double used today";
  els.watchDouble.setAttribute("aria-disabled", doubleLeft ? "false" : "true");
}

function showResult(receipt) {
  setPlaying(false);
  if (receipt.seed && Array.isArray(receipt.inputs)) {
    mode = receipt.mode || (String(receipt.seed).startsWith("daily-") ? "daily" : "practice");
    seed = receipt.seed;
    inputs = receipt.inputs.slice();
    state = stateAfter(seed, inputs, receipt.tick || 0);
  }
  doubled = receipt.doubled === true;
  shownPoints = typeof receipt.points === "number" ? receipt.points : receipt.score || 0;
  liveReceipt = receipt;
  setScreen("result");
  const daily = mode === "daily";
  els.resultKicker.textContent = daily ? "Ranked" : "Practice";
  els.resultTitle.textContent = daily ? "Today's run is in" : "Practice run";
  els.resultScore.textContent = points.format(shownPoints);
  els.resultBands.textContent = String(receipt.bands || 0);
  els.resultHash.textContent = receipt.hash || "—";
  const moves = Array.isArray(receipt.inputs) ? receipt.inputs.length : 0;
  const didContinue = receipt.continued || continued(receipt.inputs);
  els.resultMeta.textContent = didContinue
    ? `${moves} moves · ${receipt.tick || 0} ticks · continue`
    : `${moves} moves · ${receipt.tick || 0} ticks`;
  els.resultNote.textContent = noteFor(receipt);
  const label = dailyLabel();
  const lookingAtDaily = daily && today() && today().status === "done";
  els.other.hidden = lookingAtDaily;
  els.other.textContent = label;
  els.playDaily.textContent = label;
  setStatus(`Run over. ${points.format(shownPoints)} points.`);
  syncRewardButtons();
  renderHud();
}

function receiptFrom(ok) {
  const base = state.score;
  return {
    status: "done",
    mode,
    seed,
    score: base,
    points: doubled ? base * 2 : base,
    doubled: doubled === true,
    continued: continued(inputs),
    bands: state.bands,
    tick: state.tick,
    hash: boardHash(state),
    inputs,
    ok,
    stored: false,
    when: new Date().toISOString(),
  };
}

function persistOpen() {
  if (mode !== "daily" || !state || !state.alive) return;
  writeJson(dailyKey(), {
    status: "open",
    mode,
    seed,
    score: state.score,
    points: state.score,
    doubled: false,
    continued: continued(inputs),
    bands: state.bands,
    tick: state.tick,
    hash: boardHash(state),
    inputs,
  });
}

function finish() {
  if (!state) return;
  const hash = boardHash(state);
  const check = verifyRun(seed, inputs, state.tick, state.score, state.bands, hash);
  const receipt = receiptFrom(check.ok);
  if (mode === "daily") receipt.stored = writeJson(dailyKey(), receipt);
  else {
    receipt.stored = writeJson("blockfall.practice.last", receipt);
    rememberBest(receipt.points);
  }
  shownPoints = receipt.points;
  renderHud();
  showResult(receipt);
}

function begin(nextMode) {
  if (adBusy) return;
  clearAd();
  doubled = false;
  paused = false;
  mode = nextMode;
  if (mode === "daily") {
    seed = `daily-${lagosDateKey()}`;
    const saved = today();
    if (saved && saved.status === "done") {
      showResult(saved);
      return;
    }
    if (saved && saved.status === "open" && saved.seed === seed && Array.isArray(saved.inputs)) {
      inputs = saved.inputs.slice();
      state = stateAfter(seed, inputs, saved.tick || 0);
    } else {
      inputs = [];
      state = createState(seed);
    }
  } else {
    seed = `practice-${Date.now().toString(36)}`;
    inputs = [];
    state = createState(seed);
  }
  if (!state.alive) {
    finish();
    return;
  }
  acc = 0;
  last = 0;
  shownPoints = state.score;
  setPlaying(true);
  setScreen("play");
  music.resume();
  renderHud();
  setStatus(mode === "daily" ? "Today's tile order is locked in." : "Practice. This run is not ranked.");
  layout();
  if (mode === "daily") persistOpen();
}

function stopRun() {
  if (!playing || paused || !state) return;
  paused = true;
  last = 0;
  acc = 0;
  resetPointers();
  syncPads();
  setScreen("pause");
  music.pause();
  setStatus("Stopped.");
  renderHud();
  layout();
}

function resumeRun() {
  if (!playing || !paused) return;
  paused = false;
  last = 0;
  acc = 0;
  setScreen("play");
  syncPads();
  music.resume();
  setStatus(mode === "daily" ? "Today's tile order is locked in." : "Practice. This run is not ranked.");
  layout();
}

function endRun() {
  if (!playing || !state) return;
  paused = false;
  setPlaying(false);
  finish();
}

function previewContinue() {
  if (!state || state.alive) return null;
  const deathTick = state.tick - 1;
  if (deathTick < 0) return null;
  const prior = inputs.filter((input) => input.t < deathTick);
  const nextInputs = prior.concat([{ t: deathTick, a: "V" }]);
  const next = stateAfter(seed, nextInputs, deathTick + 1);
  if (!next.alive || !next.piece) return null;
  return { inputs: nextInputs, state: next };
}

function commitContinue(preview) {
  inputs = preview.inputs;
  state = preview.state;
  doubled = false;
  shownPoints = state.score;
  acc = 0;
  last = 0;
  paused = false;
  setPlaying(true);
  setScreen("play");
  music.resume();
  renderHud();
  setStatus("Continued. Same run.");
  layout();
  if (mode === "daily") persistOpen();
}

function applyDouble() {
  if (!liveReceipt || doubled) return;
  doubled = true;
  liveReceipt.doubled = true;
  liveReceipt.points = (liveReceipt.score || 0) * 2;
  shownPoints = liveReceipt.points;
  if (mode === "daily") liveReceipt.stored = writeJson(dailyKey(), liveReceipt);
  else {
    writeJson("blockfall.practice.last", liveReceipt);
    rememberBest(liveReceipt.points);
  }
  els.resultScore.textContent = points.format(shownPoints);
  els.resultNote.textContent = noteFor(liveReceipt);
  setStatus(`Points doubled to ${points.format(shownPoints)}.`);
  renderHud();
}

async function onContinue() {
  if (adBusy) return;
  const preview = previewContinue();
  if (!preview) {
    setStatus("This run cannot continue.");
    syncRewardButtons();
    return;
  }
  adBusy = true;
  try {
    const result = await ads.watch("continue");
    if (!result.rewarded) {
      if (result.reason === "cap") setStatus("One continue a day. Already used.");
      return;
    }
    commitContinue(preview);
  } finally {
    adBusy = false;
    if (screen === "result") syncRewardButtons();
  }
}

async function onDouble() {
  if (adBusy) return;
  adBusy = true;
  try {
    const result = await ads.watch("double");
    if (!result.rewarded) {
      if (result.reason === "cap") setStatus("One double a day. Already used.");
      return;
    }
    applyDouble();
  } finally {
    adBusy = false;
    if (screen === "result") syncRewardButtons();
  }
}

function press(action, down) {
  if (!playing || paused) return;
  if (action === "C" || action === "H") {
    if (down) once.push(action);
    return;
  }
  if (down && !hold[action]) tap[action] = true;
  hold[action] = down;
  if (!down) arm[action] = 0;
}

function axis(action, blocked) {
  if (blocked) {
    tap[action] = false;
    return false;
  }
  const due = tap[action] || (hold[action] && arm[action] % REPEAT_EVERY === 0);
  if (!due) return false;
  tap[action] = false;
  return true;
}

function collect() {
  const actions = [];
  if (axis("L", hold.R)) actions.push("L");
  if (axis("R", hold.L)) actions.push("R");
  if (hold.L) arm.L += 1;
  if (hold.R) arm.R += 1;
  for (let i = 0; i < once.length; i++) {
    const action = once[i];
    if (action === "H") {
      actions.push("H");
      once.length = 0;
      tap.S = false;
      return actions;
    }
    actions.push(action);
  }
  once.length = 0;
  if (tap.S || (hold.S && state.tick % 2 === 0)) actions.push("S");
  tap.S = false;
  return actions;
}

function tick() {
  const actions = collect();
  for (let i = 0; i < actions.length; i++) inputs.push({ t: state.tick, a: actions[i] });
  const cleared = step(state, actions);
  if (cleared.length) renderer.burst(cleared);
  renderer.tickFx();
  renderHud();
  if (cleared.length) setStatus(state.combo > 1 ? `Chain ×${state.combo}.` : "Band cleared.");
  if (!state.alive) {
    setPlaying(false);
    finish();
    return;
  }
  if (mode === "daily" && (actions.length > 0 || state.tick % 20 === 0)) persistOpen();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (screen === "splash") {
    renderer.setClock(now);
    renderer.paintMark(els.mark, glyphs[0]);
  }
  if (!playing || paused || !state) {
    last = 0;
    acc = 0;
    if (paused && state && screen === "pause") {
      renderer.setClock(spinTime);
      renderer.draw(state);
    }
    return;
  }
  if (!last) last = now;
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= TICK_MS && playing && !paused) {
    acc -= TICK_MS;
    tick();
  }
  spinTime = now;
  renderer.setClock(spinTime);
  if (state && playing) renderer.draw(state);
}

els.openPlay.addEventListener("click", () => {
  music.start();
  showStart();
});
els.mute.addEventListener("click", () => {
  music.toggleMute();
  paintMute();
});
els.playPractice.addEventListener("click", () => begin("practice"));
els.playDaily.addEventListener("click", () => begin("daily"));
els.again.addEventListener("click", () => showStart());
els.other.addEventListener("click", () => begin("daily"));
els.home.addEventListener("click", () => showSplash());
els.resume.addEventListener("click", () => resumeRun());
els.endRun.addEventListener("click", () => endRun());
els.watchContinue.addEventListener("click", () => onContinue());
els.watchDouble.addEventListener("click", () => onDouble());
els.stop.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  stopRun();
});
els.stop.addEventListener("click", () => stopRun());

for (const pad of pads) {
  const action = pad.dataset.action;
  pad.addEventListener("pointerdown", (event) => {
    if (!playing || paused) return;
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      /* A pointer can be gone before capture; the tap still counts. */
    }
    event.preventDefault();
    press(action, true);
  });
  const release = () => press(action, false);
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
  pad.addEventListener("contextmenu", (event) => event.preventDefault());
}

document.addEventListener("keydown", (event) => {
  if (!els.ad.hidden) {
    if (event.key === "Escape") els.adCancel.click();
    event.preventDefault();
    return;
  }
  if (event.key === "p" || event.key === "P" || event.key === "Escape") {
    if (playing && !paused) {
      event.preventDefault();
      stopRun();
    } else if (paused) {
      event.preventDefault();
      resumeRun();
    }
    return;
  }
  if (!playing || paused) return;
  const action = KEYS[event.key];
  if (!action) return;
  event.preventDefault();
  if ((action === "C" || action === "H") && event.repeat) return;
  if (action === "C" || action === "H") {
    once.push(action);
    return;
  }
  if (!hold[action]) tap[action] = true;
  hold[action] = true;
});

document.addEventListener("keyup", (event) => {
  const action = KEYS[event.key];
  if (!action || action === "C" || action === "H") return;
  hold[action] = false;
  arm[action] = 0;
});

for (const input of document.querySelectorAll("[data-emoji]")) {
  input.addEventListener("change", () => {
    const index = Number(input.dataset.emoji);
    glyphs[index] = glyph(input.value, DEFAULT_EMOJIS[index]);
    input.value = glyphs[index];
    saveGlyphs();
  });
}

new ResizeObserver(() => layout()).observe(stage);
loadGlyphs();
paintMute();
state = createState(`daily-${lagosDateKey()}`);
showSplash();
requestAnimationFrame(frame);
