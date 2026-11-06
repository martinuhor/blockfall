// Local adapter for bitchat.
//
// permissionlesstech/bitchat is a native iOS, macOS, and Android app.
// Offline chat is a Bluetooth LE mesh. Internet chat uses Nostr relays.
// The project does not publish a browser API. This file does not invent
// BLE packets, Noise handshakes, or relay calls.
//
// connect, send, and onMessage move messages inside this page.
// Pass connect({ client }) only when a real client with send and onMessage
// already exists. Until then, every message is local.

export function createBitchat() {
  let client = null;
  let open = false;
  const handlers = new Set();

  function emit(message) {
    for (const handler of handlers) handler(message);
  }

  function packet(text, meta, local) {
    return {
      text: String(text ?? ""),
      from: String(meta.from || "you"),
      to: String(meta.to || ""),
      at: Date.now(),
      local,
    };
  }

  return {
    get local() {
      return client == null;
    },

    async connect(options = {}) {
      if (options.client) {
        const next = options.client;
        if (typeof next.send !== "function" || typeof next.onMessage !== "function") {
          throw new Error("A bitchat client needs send and onMessage.");
        }
        if (typeof next.connect === "function") await next.connect();
        next.onMessage((message) => {
          emit({
            text: String(message?.text ?? ""),
            from: String(message?.from || "mesh"),
            to: String(message?.to || ""),
            at: Number(message?.at) || Date.now(),
            local: false,
          });
        });
        client = next;
      }
      open = true;
      return { local: client == null };
    },

    async send(text, meta = {}) {
      if (!open) throw new Error("bitchat is not connected.");
      const fromYou = String(meta.from || "you") === "you";
      if (client && fromYou) {
        const outgoing = packet(text, meta, false);
        await client.send({
          text: outgoing.text,
          from: outgoing.from,
          to: outgoing.to,
          at: outgoing.at,
        });
        emit(outgoing);
        return outgoing;
      }
      const message = packet(text, meta, true);
      emit(message);
      return message;
    },

    onMessage(handler) {
      if (typeof handler !== "function") throw new Error("onMessage needs a function.");
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
