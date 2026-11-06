/**
 * Paystack charge.success → Printful order.
 * Verifies x-paystack-signature (HMAC SHA512 of raw body with secret key).
 */

import { text } from "../lib/http.js";
import { paystackSignatureValid } from "../lib/paystack.js";

const VARIANT_ENV = {
  S: "POD_VARIANT_ID_S",
  M: "POD_VARIANT_ID_M",
  L: "POD_VARIANT_ID_L",
  XL: "POD_VARIANT_ID_XL",
};

function metaValue(metadata, key) {
  if (!metadata) return "";
  if (metadata[key] != null) return String(metadata[key]);
  const custom = metadata.custom_fields;
  if (Array.isArray(custom)) {
    const hit = custom.find((field) => field?.variable_name === key || field?.key === key);
    if (hit?.value != null) return String(hit.value);
  }
  return "";
}

async function createPrintfulOrder(env, event) {
  const data = event.data || {};
  const metadata = data.metadata || {};
  const customer = data.customer || {};
  const reference = String(data.reference || "").slice(0, 100);
  if (!reference) throw new Error("missing reference");

  const size = metaValue(metadata, "size").toUpperCase() || "M";
  const variantKey = VARIANT_ENV[size] || "POD_VARIANT_ID_M";
  const variantId = Number(env[variantKey]);
  if (!Number.isFinite(variantId) || variantId <= 0) {
    throw new Error(`Printful variant missing for ${size}`);
  }

  const quantity = Math.min(5, Math.max(1, Number(metaValue(metadata, "quantity") || 1) || 1));
  const name = metaValue(metadata, "name") || customer.first_name || "Blockfall buyer";
  const phone = metaValue(metadata, "phone") || "";
  const address1 = metaValue(metadata, "address1");
  const city = metaValue(metadata, "city");
  const state = metaValue(metadata, "state");
  const zip = metaValue(metadata, "zip");
  const country = (metaValue(metadata, "country") || "NG").toUpperCase();
  const email = customer.email || data.customer_email || "";

  if (!address1 || !city || !state || !zip) {
    throw new Error("shipping address incomplete in Paystack metadata");
  }

  const confirm = String(env.PRINTFUL_AUTO_CONFIRM || "").toLowerCase() === "true";
  const url = `https://api.printful.com/orders${confirm ? "?confirm=true" : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.POD_API_KEY}`,
      "content-type": "application/json",
      ...(env.PRINTFUL_STORE_ID ? { "X-PF-Store-Id": env.PRINTFUL_STORE_ID } : {}),
    },
    body: JSON.stringify({
      external_id: reference,
      recipient: {
        name,
        address1,
        city,
        state_code: state,
        state_name: state,
        country_code: country,
        zip,
        phone,
        email,
      },
      items: [{ sync_variant_id: variantId, quantity }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.result || response.status);
    if (/external_id|already exists|duplicate/i.test(message)) {
      return { ok: true, duplicate: true };
    }
    throw new Error(message);
  }
  return { ok: true, id: payload?.result?.id };
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYSTACK_SECRET_KEY || !env.POD_API_KEY) {
    return text("webhook not configured", 503);
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  const ok = await paystackSignatureValid(env.PAYSTACK_SECRET_KEY, raw, signature);
  if (!ok) return text("bad signature", 401);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return text("bad json", 400);
  }

  if (event.event !== "charge.success") return text("ignored");
  if (String(event.data?.status || "").toLowerCase() !== "success") return text("not success");

  try {
    await createPrintfulOrder(env, event);
  } catch (err) {
    console.error("printful", err);
    return text(`printful: ${err.message || err}`, 500);
  }

  return text("ok");
}
