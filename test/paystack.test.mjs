import test from "node:test";
import assert from "node:assert/strict";
import { paystackSignatureHex, paystackSignatureValid } from "../functions/lib/paystack.js";

test("Paystack HMAC-SHA512 matches a known vector", async () => {
  const secret = "sk_test_example";
  const body = '{"event":"charge.success"}';
  const hex = await paystackSignatureHex(secret, body);
  assert.equal(hex.length, 128);
  assert.equal(await paystackSignatureValid(secret, body, hex), true);
  assert.equal(await paystackSignatureValid(secret, body, "0".repeat(128)), false);
  assert.equal(await paystackSignatureValid(secret, body, ""), false);
});
