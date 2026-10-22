// Soundtrack. The game and the soundtrack page both use this list.

export const ARTIST = "Silent Parker";
const MUTE_KEY = "blockfall.muted";
const ORDER_KEY = "blockfall.ost.order";

export const PLAYLIST = [
  { src: "audio/01-whitespace.mp3", title: "Whitespace", feat: [] },
  { src: "audio/02-akg.mp3", title: "AKG", feat: [] },
  { src: "audio/03-best.m4a", title: "BE$T", feat: ["DavieFvr"] },
  { src: "audio/04-je-suis.m4a", title: "Je Suis", feat: ["Sinachi"] },
  { src: "audio/05-candy-paint.mp3", title: "Candy Paint", feat: ["DavieFvr"] },
  { src: "audio/06-gate-crashing.m4a", title: "Gate Crashing", feat: ["DavieFvr"] },
  { src: "audio/07-genevieve.m4a", title: "Geneviéve", feat: ["TRAP KYD"] },
  { src: "audio/08-hands-down.m4a", title: "Hands Down", feat: ["CakemanBara"] },
  { src: "audio/09-piece-of-mind.mp3", title: "Piece of Mind", feat: ["Javan Santana"] },
  { src: "audio/10-later.m4a", title: "Later", feat: ["DavieFvr"] },
  { src: "audio/11-plat.m4a", title: "PLAT", feat: ["pa1n", "TRAP KYD"] },
  { src: "audio/12-ten-ten.mp3", title: "10/10", feat: [] },
  { src: "audio/13-paid-her-car-note.mp3", title: "Paid Her Car Note", feat: ["Sativagotbandz", "CakemanBara"] },
  { src: "audio/14-pressure.m4a", title: "Pressure", feat: ["DavieFvr", "Sativagotbandz"] },
  { src: "audio/15-ragebait.m4a", title: "RAGEBAIT", feat: [] },
  { src: "audio/16-satisfiying.m4a", title: "SATISFIYING", feat: ["Kliensman", "Meko"] },
  { src: "audio/17-shehu-shagari-way.m4a", title: "SHEHU SHAGARI WAY", feat: ["DetailMadeIt"] },
  { src: "audio/18-abuja.m4a", title: "Abuja", feat: ["ODUMODUBLVCK"] },
  { src: "audio/19-the-tallest-poppy.m4a", title: "The Tallest Poppy", feat: ["DavieFvr", "DDN$", "PsychoYP"] },
];

export function featPhrase(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return "";
  if (list.length === 1) return `(feat. ${list[0]})`;
  if (list.length === 2) return `(feat. ${list[0]} and ${list[1]})`;
  return `(feat. ${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]})`;
}

export function trackLine(track) {
  if (!track) return "";
  const feat = featPhrase(track.feat);
  return feat ? `${track.title} ${feat}` : track.title;
}

export function defaultOrder() {
  return PLAYLIST.map((_, index) => index);
}

export function loadOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || "");
    if (!Array.isArray(raw) || raw.length !== PLAYLIST.length) return defaultOrder();
    const seen = new Set();
    for (const value of raw) {
      if (!Number.isInteger(value) || value < 0 || value >= PLAYLIST.length || seen.has(value)) {
        return defaultOrder();
      }
      seen.add(value);
    }
    return raw.slice();
  } catch {
    return defaultOrder();
  }
}

export function saveOrder(order) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* Order stays in memory if the phone refuses storage. */
  }
}

function randomIndex(length) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function createMusic(audio, onTrack) {
  let order = loadOrder();
  let pos = randomIndex(order.length);
  let started = false;
  let held = false;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  audio.preload = "auto";
  audio.muted = muted;

  function current() {
    return PLAYLIST[order[pos]];
  }

  function paint() {
    onTrack(started ? current() : null);
  }

  function cue(nextPos, andPlay) {
    order = loadOrder();
    pos = (nextPos + order.length) % order.length;
    audio.src = current().src;
    paint();
    if (andPlay && started && !held) {
      const pending = audio.play();
      if (pending) pending.catch(() => {});
    }
  }

  function hasSrc() {
    return Boolean(audio.getAttribute("src"));
  }

  audio.addEventListener("ended", () => {
    if (!started) return;
    cue(pos + 1, true);
  });

  return {
    start() {
      const fresh = !started;
      started = true;
      held = false;
      audio.muted = muted;
      if (fresh || !hasSrc()) cue(randomIndex(order.length), false);
      paint();
      const pending = audio.play();
      if (pending) pending.catch(() => {});
    },
    pause() {
      if (!started) return;
      held = true;
      audio.pause();
    },
    resume() {
      if (!started || !held) return;
      held = false;
      audio.muted = muted;
      const pending = audio.play();
      if (pending) pending.catch(() => {});
    },
    stop() {
      started = false;
      held = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      paint();
    },
    toggleMute() {
      muted = !muted;
      audio.muted = muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      } catch {
        /* Mute still applies for this visit. */
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
