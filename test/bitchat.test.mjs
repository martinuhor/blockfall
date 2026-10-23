import test from "node:test";
import assert from "node:assert/strict";
import { createBitchat } from "../js/bitchat.js";

test("connect, send, and onMessage stay on this page", async () => {
  const chat = createBitchat();
  const link = await chat.connect();
  assert.equal(link.local, true);
  assert.equal(chat.local, true);
  let seen = null;
  const stop = chat.onMessage((message) => {
    seen = message;
  });
  await chat.send("hello", { from: "you", to: "ada", lat: 6.5, lng: 3.4, coords: [1, 2] });
  assert.deepEqual(Object.keys(seen).sort(), ["at", "from", "local", "text", "to"]);
  assert.equal(seen.text, "hello");
  assert.equal(seen.local, true);
  assert.equal(seen.from, "you");
  stop();
  await chat.send("again", { from: "you", to: "ada" });
  assert.equal(seen.text, "hello");
});

test("a room person is not forwarded to a plugged-in client", async () => {
  const sent = [];
  const client = {
    connect() {
      this.ready = true;
    },
    send(message) {
      sent.push(message);
    },
    onMessage(handler) {
      this.handler = handler;
    },
  };
  const chat = createBitchat();
  const link = await chat.connect({ client });
  assert.equal(link.local, false);
  assert.equal(client.ready, true);
  let seen = null;
  chat.onMessage((message) => {
    seen = message;
  });
  await chat.send("I'm Ada, a person in this room.", { from: "ada", to: "you" });
  assert.equal(sent.length, 0);
  assert.equal(seen.local, true);
  assert.equal(seen.from, "ada");
  await chat.send("Zobo, please.", { from: "you", to: "ada" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "Zobo, please.");
  assert.equal(Object.hasOwn(sent[0], "lat"), false);
  assert.equal(seen.local, false);
});

test("send before connect fails and a client must have the two hooks", async () => {
  const chat = createBitchat();
  await assert.rejects(() => chat.send("hi"));
  await assert.rejects(() => chat.connect({ client: { send() {} } }));
});
