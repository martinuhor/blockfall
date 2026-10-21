// Ad boundary. The game calls createAds and does not talk to a network.
// A rewarded-video SDK replaces the provider. It must implement:
//   line: string
//   showRewarded(placement) -> Promise<{ completed: boolean }>
// completed is true only after the player finishes the rewarded view.
// The local provider is an honest sponsor card. It does not run an auction.

const PLACEMENTS = ["continue", "double"];

export function createLocalSponsorBreak({ paint, clear }) {
  return {
    id: "local-sponsor-break",
    line: "Sample sponsor · local card, not a live auction",
    showRewarded(placement) {
      const reward = placement === "continue" ? "continue this run" : "double this run's points";
      return new Promise((resolve) => {
        let left = 3;
        let timer = 0;
        let settled = false;
        const finish = (completed) => {
          if (settled) return;
          settled = true;
          if (timer) clearInterval(timer);
          clear();
          resolve({ completed });
        };
        const cancel = () => finish(false);
        const draw = () => {
          paint({
            sponsor: "Sample sponsor",
            message: "This card stands in for a rewarded video. No auction ran, and nothing is charged.",
            reward,
            seconds: left,
            cancel,
          });
        };
        draw();
        timer = setInterval(() => {
          left -= 1;
          if (left <= 0) finish(true);
          else draw();
        }, 1000);
      });
    },
  };
}

export function createAds({ storage, dateKey, provider, paint, clear }) {
  const store = storage || localStorage;
  const day = dateKey;
  const source = provider || createLocalSponsorBreak({ paint, clear });

  function key() {
    return `blockfall.rewards.${day()}`;
  }

  function load() {
    try {
      const raw = store.getItem(key());
      const data = raw ? JSON.parse(raw) : {};
      return {
        continue: data.continue === true,
        double: data.double === true,
      };
    } catch {
      return { continue: false, double: false };
    }
  }

  function save(caps) {
    store.setItem(key(), JSON.stringify({ continue: caps.continue === true, double: caps.double === true }));
  }

  return {
    line() {
      return source.line;
    },
    remaining(placement) {
      if (!PLACEMENTS.includes(placement)) return 0;
      return load()[placement] ? 0 : 1;
    },
    async watch(placement) {
      if (!PLACEMENTS.includes(placement)) return { rewarded: false, reason: "unknown" };
      if (load()[placement]) return { rewarded: false, reason: "cap" };
      let shown;
      try {
        shown = await source.showRewarded(placement);
      } catch {
        clear();
        return { rewarded: false, reason: "error" };
      }
      if (!shown || shown.completed !== true) return { rewarded: false, reason: "closed" };
      const caps = load();
      caps[placement] = true;
      try {
        save(caps);
      } catch {
        return { rewarded: false, reason: "storage" };
      }
      return { rewarded: true, placement };
    },
  };
}
