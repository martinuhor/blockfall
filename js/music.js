// Soundtrack. The game calls this module. Files live in audio/.

export const PLAYLIST = [
  { src: "audio/01-whitespace.mp3", title: "Whitespace", feat: "" },
  { src: "audio/02-akg.mp3", title: "AKG", feat: "" },
  { src: "audio/03-best.m4a", title: "BE$T", feat: "DavieFvr" },
  { src: "audio/04-je-suis.m4a", title: "Je Suis", feat: "Sinachi" },
  { src: "audio/05-candy-paint.mp3", title: "Candy Paint", feat: "DavieFvr" },
  { src: "audio/06-gate-crashing.m4a", title: "Gate Crashing", feat: "DavieFvr" },
  { src: "audio/07-genevieve.m4a", title: "Geneviéve", feat: "TRAP KYD" },
  { src: "audio/08-hands-down.m4a", title: "Hands Down", feat: "CakemanBara" },
  { src: "audio/09-piece-of-mind.mp3", title: "Piece of Mind", feat: "Javan Santana" },
  { src: "audio/10-later.m4a", title: "Later", feat: "DavieFvr" },
  { src: "audio/11-plat.m4a", title: "PLAT", feat: "pa1n and TRAP KYD" },
  { src: "audio/12-ten-ten.mp3", title: "10/10", feat: "" },
  { src: "audio/13-paid-her-car-note.mp3", title: "Paid Her Car Note", feat: "Sativagotbandz and CakemanBara" },
  { src: "audio/14-pressure.m4a", title: "Pressure", feat: "DavieFvr and Sativagotbandz" },
  { src: "audio/15-ragebait.m4a", title: "RAGEBAIT", feat: "" },
  { src: "audio/16-satisfiying.m4a", title: "SATISFIYING", feat: "Kliensman and Meko" },
  { src: "audio/17-shehu-shagari-way.m4a", title: "SHEHU SHAGARI WAY", feat: "DetailMadeIt" },
  { src: "audio/18-abuja.m4a", title: "Abuja", feat: "ODUMODUBLVCK" },
  { src: "audio/19-the-tallest-poppy.m4a", title: "The Tallest Poppy", feat: "DavieFvr, DDN$, and PsychoYP" },
];

const MUTE_KEY = "blockfall.muted";

export function credit(track) {
  if (!track) return "";
  return track.feat ? `Silent Parker feat. ${track.feat}` : "Silent Parker";
}

export function trackLine(track) {
  if (!track) return "";
  return `${track.title} · ${credit(track)}`;
}

export function createMusic(audio, onTrack) {
  let index = 0;
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

  function paint() {
    onTrack(started ? PLAYLIST[index] : null);
  }

  function load(next, andPlay) {
    index = (next + PLAYLIST.length) % PLAYLIST.length;
    audio.src = PLAYLIST[index].src;
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
    load(index + 1, true);
  });

  return {
    start() {
      const fresh = !started;
      started = true;
      held = false;
      audio.muted = muted;
      if (fresh || !hasSrc()) load(0, false);
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
      index = 0;
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
        /* The phone can refuse storage. Mute still applies for this visit. */
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
