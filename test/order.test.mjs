import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_PIN,
  bandForKm,
  bandToStore,
  denialCode,
  denialReason,
  errandKind,
  errandLine,
  haversineKm,
  normalizeBand,
  readingToBand,
} from "../js/order.js";

test("under 1.5 km is a handoff and 1.5 km or farther is a delivery", () => {
  assert.equal(bandForKm(0), "near");
  assert.equal(bandForKm(1.499), "near");
  assert.equal(bandForKm(1.5), "far");
  assert.equal(bandForKm(8), "far");
  assert.equal(errandKind("near"), "handoff");
  assert.equal(errandKind("far"), "delivery");
  assert.equal(errandKind("near", { denied: true }), "delivery");
});

test("a reading collapses to a band and the same pin is near", () => {
  const band = readingToBand(ROOM_PIN.lat, ROOM_PIN.lng);
  assert.equal(band, "near");
  assert.equal(typeof band, "string");
  assert.equal(Object.keys({ band }).includes("lat"), false);
});

test("about a kilometer north is near and about two kilometers north is far", () => {
  const nearKm = haversineKm(ROOM_PIN.lat, ROOM_PIN.lng, ROOM_PIN.lat + 0.01, ROOM_PIN.lng);
  const farKm = haversineKm(ROOM_PIN.lat, ROOM_PIN.lng, ROOM_PIN.lat + 0.02, ROOM_PIN.lng);
  assert.ok(nearKm > 0.8 && nearKm < 1.5, String(nearKm));
  assert.ok(farKm > 1.5 && farKm < 3, String(farKm));
  assert.equal(readingToBand(ROOM_PIN.lat + 0.01, ROOM_PIN.lng), "near");
  assert.equal(readingToBand(ROOM_PIN.lat + 0.02, ROOM_PIN.lng), "far");
});

test("Abuja is outside the handoff band", () => {
  const km = haversineKm(ROOM_PIN.lat, ROOM_PIN.lng, 9.0765, 7.3986);
  assert.ok(km > 400);
  assert.equal(readingToBand(9.0765, 7.3986), "far");
});

test("storage accepts only the near or far band", () => {
  assert.equal(bandToStore("near"), "near");
  assert.equal(bandToStore("far"), "far");
  assert.equal(normalizeBand("6.45,3.39"), null);
  assert.throws(() => bandToStore("6.4541,3.3947"));
});

test("a denied location is said as a delivery", () => {
  assert.equal(denialCode({ code: 1 }), "denied");
  assert.equal(denialCode({ code: 3 }), "timeout");
  assert.match(denialReason("denied"), /denied/);
  assert.match(denialReason("denied"), /delivery/);
  const line = errandLine({ kind: "delivery", item: "Zobo", deniedCode: "denied", fresh: true });
  assert.match(line, /Zobo/);
  assert.match(line, /denied/);
  assert.equal(line.includes("6."), false);
});
