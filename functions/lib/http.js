/** Shared JSON / CORS helpers for Pages Functions. */

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export function text(message, status = 200) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function options(...methods) {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": `${methods.join(", ")}, OPTIONS`,
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
    },
  });
}

export function clean(value, max = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
