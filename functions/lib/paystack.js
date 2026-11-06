/** Paystack webhook signature helpers (HMAC-SHA512). */

export async function paystackSignatureHex(secret, rawBody) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function paystackSignatureValid(secret, rawBody, headerValue) {
  if (!secret || !headerValue) return false;
  const expected = await paystackSignatureHex(secret, rawBody);
  if (expected.length !== headerValue.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ headerValue.charCodeAt(i);
  }
  return mismatch === 0;
}
