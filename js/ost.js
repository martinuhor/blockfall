import { ARTIST, PLAYLIST, loadOrder, saveOrder, trackLine } from "./music.js";

const audio = document.querySelector("#player");
const title = document.querySelector("#title");
const artist = document.querySelector("#artist");
const elapsed = document.querySelector("#elapsed");
const duration = document.querySelector("#duration");
const scrub = document.querySelector("#scrub");
const volume = document.querySelector("#volume");
const mute = document.querySelector("#mute");
const list = document.querySelector("#list");

const VOLUME_KEY = "blockfall.ost.volume";

let order = loadOrder();
let pos = randomIndex(order.length);
let scrubbing = false;
let dragFrom = -1;

function randomIndex(length) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % length;
}

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function track() {
  return PLAYLIST[order[pos]];
}

function paintHeading() {
  title.textContent = trackLine(track());
  artist.textContent = ARTIST;
}

function paintTimes() {
  elapsed.textContent = clock(audio.currentTime);
  duration.textContent = clock(audio.duration);
  if (!scrubbing && Number.isFinite(audio.duration) && audio.duration > 0) {
    scrub.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  }
}

function paintMute() {
  mute.textContent = audio.muted ? "Unmute" : "Mute";
  mute.setAttribute("aria-pressed", audio.muted ? "true" : "false");
}

function renderList() {
  list.replaceChildren();
  order.forEach((id, index) => {
    const item = document.createElement("li");
    item.draggable = true;
    if (index === pos) item.className = "current";
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.textContent = trackLine(PLAYLIST[id]);
    pick.addEventListener("click", () => choose(index, !audio.paused));
    const up = document.createElement("button");
    up.type = "button";
    up.className = "nudge";
    up.textContent = "Up";
    up.disabled = index === 0;
    up.addEventListener("click", () => move(index, index - 1));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "nudge";
    down.textContent = "Down";
    down.disabled = index === order.length - 1;
    down.addEventListener("click", () => move(index, index + 1));
    item.addEventListener("dragstart", () => {
      dragFrom = index;
      item.classList.add("drag");
    });
    item.addEventListener("dragend", () => item.classList.remove("drag"));
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      move(dragFrom, index);
      dragFrom = -1;
    });
    item.append(pick, up, down);
    list.append(item);
  });
}

function cue(next, andPlay) {
  pos = (next + order.length) % order.length;
  const playing = track();
  audio.src = playing.src;
  paintHeading();
  renderList();
  if (andPlay) {
    const pending = audio.play();
    if (pending) pending.catch(() => {});
  }
}

function choose(index, andPlay) {
  cue(index, andPlay);
}

function move(from, to) {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
  const playing = order[pos];
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  pos = order.indexOf(playing);
  saveOrder(order);
  renderList();
}

function play() {
  if (!audio.getAttribute("src")) cue(pos, false);
  const pending = audio.play();
  if (pending) pending.catch(() => {});
}

function stop() {
  audio.pause();
  audio.currentTime = 0;
  paintTimes();
}

document.querySelector("#play").addEventListener("click", play);
document.querySelector("#pause").addEventListener("click", () => audio.pause());
document.querySelector("#stop").addEventListener("click", stop);
document.querySelector("#next").addEventListener("click", () => cue(pos + 1, !audio.paused));
document.querySelector("#prev").addEventListener("click", () => {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  cue(pos - 1, !audio.paused);
});

scrub.addEventListener("pointerdown", () => {
  scrubbing = true;
});
scrub.addEventListener("input", () => {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  elapsed.textContent = clock((Number(scrub.value) / 1000) * audio.duration);
});
scrub.addEventListener("change", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number(scrub.value) / 1000) * audio.duration;
  }
  scrubbing = false;
  paintTimes();
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value) / 100;
  try {
    localStorage.setItem(VOLUME_KEY, volume.value);
  } catch {
    /* The level still applies for this visit. */
  }
});

mute.addEventListener("click", () => {
  audio.muted = !audio.muted;
  try {
    localStorage.setItem("blockfall.muted", audio.muted ? "1" : "0");
  } catch {
    /* Mute still applies for this visit. */
  }
  paintMute();
});

audio.addEventListener("timeupdate", paintTimes);
audio.addEventListener("loadedmetadata", paintTimes);
audio.addEventListener("ended", () => cue(pos + 1, true));

try {
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored !== null && Number.isFinite(Number(stored))) volume.value = stored;
  audio.muted = localStorage.getItem("blockfall.muted") === "1";
} catch {
  audio.muted = false;
}
audio.volume = Number(volume.value) / 100;
paintMute();
cue(pos, false);

const canvasClips = [...document.querySelectorAll(".canvas video")];
let canvasShown = canvasClips.findIndex((clip) => clip.classList.contains("on"));
if (canvasShown < 0) canvasShown = 0;

function playCanvas() {
  canvasClips.forEach((clip) => {
    clip.muted = true;
    const pending = clip.play();
    if (pending) pending.catch(() => {});
  });
}

if (canvasClips.length > 1) {
  window.setInterval(() => {
    canvasClips[canvasShown].classList.remove("on");
    canvasShown = (canvasShown + 1) % canvasClips.length;
    canvasClips[canvasShown].classList.add("on");
  }, 7000);
}

playCanvas();
document.addEventListener("pointerdown", playCanvas, { once: true });
