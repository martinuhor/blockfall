/** Fire-and-forget product analytics. Never blocks gameplay. */

export function track(name, props = {}) {
  try {
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/event", blob);
      return;
    }
    fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never throw into the game loop */
  }
}
