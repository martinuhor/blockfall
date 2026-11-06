// Order distance for the room.
// A visitor reading is turned into a near or far band and then dropped.
// The pin is the room's handoff point on Lagos Island, not a visitor location.

export const HANDOFF_KM = 1.5;
export const BAND_KEY = "blockfall.room.band";

export const ROOM_PIN = Object.freeze({
  lat: 6.4541,
  lng: 3.3947,
});

const EARTH_KM = 6371.0088;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bandForKm(km) {
  if (!Number.isFinite(km) || km < 0) return "far";
  return km < HANDOFF_KM ? "near" : "far";
}

export function readingToBand(lat, lng, pin = ROOM_PIN) {
  return bandForKm(haversineKm(lat, lng, pin.lat, pin.lng));
}

export function normalizeBand(value) {
  return value === "near" || value === "far" ? value : null;
}

export function bandToStore(band) {
  const clean = normalizeBand(band);
  if (!clean) throw new Error("Only a near or far band can be stored.");
  return clean;
}

export function errandKind(band, { denied = false } = {}) {
  if (denied || band !== "near") return "delivery";
  return "handoff";
}

export function denialReason(code) {
  if (code === "denied") {
    return "Location was denied, so this goes out as a delivery. We can't confirm you're under 1.5 km for a handoff.";
  }
  if (code === "timeout") {
    return "Location wasn't available in time, so this goes out as a delivery. We can't confirm you're under 1.5 km for a handoff.";
  }
  if (code === "unsupported") {
    return "This browser has no location service, so this goes out as a delivery. We can't confirm you're under 1.5 km for a handoff.";
  }
  return "Location couldn't be read, so this goes out as a delivery. We can't confirm you're under 1.5 km for a handoff.";
}

export function denialCode(error) {
  const code = error && error.code;
  if (code === 1) return "denied";
  if (code === 2) return "unavailable";
  if (code === 3) return "timeout";
  return "unsupported";
}

export function errandLine({ kind, item, deniedCode, fresh }) {
  const name = item || "The order";
  if (deniedCode) return `${name} is a delivery. ${denialReason(deniedCode)}`;
  if (kind === "handoff") {
    return fresh
      ? `${name} stays in the room. You're in the near band, under 1.5 km, so Seyi walks it over.`
      : `${name} stays in the room. This session is in the near band, so Seyi walks it over.`;
  }
  return fresh
    ? `${name} leaves toward the door. You're in the far band, 1.5 km or farther.`
    : `${name} leaves toward the door. This session is in the far band.`;
}
