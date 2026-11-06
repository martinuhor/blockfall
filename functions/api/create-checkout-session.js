/**
 * Start a Paystack checkout for the Blockfall tee (NGN / kobo).
 * Secrets live in Cloudflare Pages env — never in the frontend.
 */

const VARIANT_ENV = {
  S: "POD_VARIANT_ID_S",
  M: "POD_VARIANT_ID_M",
  L: "POD_VARIANT_ID_L",
  XL: "POD_VARIANT_ID_XL",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function missingSecrets(env) {
  const needed = [
    "PAYSTACK_SECRET_KEY",
    "POD_API_KEY",
    "POD_VARIANT_ID_S",
    "POD_VARIANT_ID_M",
    "POD_VARIANT_ID_L",
    "POD_VARIANT_ID_XL",
    "MERCH_UNIT_AMOUNT",
  ];
  return needed.filter((key) => !env[key]);
}

function clean(value, max = 120) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

export async function onRequestPost({ request, env }) {
  const absent = missingSecrets(env);
  if (absent.length) {
    return json(
      {
        error:
          "Checkout is not configured. Set Paystack and Printful secrets in Cloudflare Pages (see README).",
        missing: absent,
      },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON with size, colour, and shipping." }, 400);
  }

  const size = clean(body.size, 4).toUpperCase();
  const color = clean(body.color, 24).toLowerCase();
  const email = clean(body.email, 160).toLowerCase();
  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  const address1 = clean(body.address1, 200);
  const city = clean(body.city, 80);
  const state = clean(body.state, 80);
  const zip = clean(body.zip, 24);
  const country = clean(body.country || "NG", 2).toUpperCase();
  const quantity = Math.min(5, Math.max(1, Number(body.quantity) || 1));

  if (!VARIANT_ENV[size]) return json({ error: "Pick size S, M, L, or XL." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email is required for Paystack." }, 400);
  }
  if (!name || !phone || !address1 || !city || !state || !zip) {
    return json({ error: "Shipping name, phone, and address are required." }, 400);
  }

  const unit = Number(env.MERCH_UNIT_AMOUNT);
  if (!Number.isFinite(unit) || unit < 100) {
    return json({ error: "MERCH_UNIT_AMOUNT must be kobo (e.g. 1500000 for ₦15,000)." }, 503);
  }

  const currency = (env.MERCH_CURRENCY || "NGN").toUpperCase();
  const amount = String(Math.round(unit * quantity));
  const reference = `bf_${crypto.randomUUID().replace(/-/g, "")}`;
  const origin = new URL(request.url).origin;
  const callback =
    env.MERCH_SUCCESS_URL ||
    `${origin}/?merch=paid&reference=${encodeURIComponent(reference)}`;

  const metadata = {
    size,
    color,
    quantity: String(quantity),
    name,
    phone,
    address1,
    city,
    state,
    zip,
    country,
    variant_env: VARIANT_ENV[size],
  };

  const paystack = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      currency,
      reference,
      callback_url: callback,
      channels: ["card", "bank", "ussd", "bank_transfer", "qr"],
      metadata,
    }),
  });

  const payload = await paystack.json().catch(() => ({}));
  if (!paystack.ok || !payload.status || !payload.data?.authorization_url) {
    return json(
      {
        error: payload.message || "Paystack could not start checkout.",
      },
      502
    );
  }

  return json({
    authorization_url: payload.data.authorization_url,
    reference: payload.data.reference || reference,
    access_code: payload.data.access_code,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}
