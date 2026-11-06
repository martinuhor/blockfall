import { track } from "./analytics.js";

const dialog = document.querySelector("#merch-dialog");
const openBtn = document.querySelector("#merch-btn");
const form = document.querySelector("#merch-form");
const status = document.querySelector("#merch-status");
const buyBtn = document.querySelector("#merch-buy");

const SIZES = ["S", "M", "L", "XL"];
const COLORS = [
  { id: "sand", label: "Sand" },
  { id: "ink", label: "Ink" },
  { id: "amber", label: "Amber" },
];

let lastFocus = null;

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = isError ? "error" : "";
}

function focusables() {
  if (!dialog) return [];
  return [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.hasAttribute("disabled") && node.offsetParent !== null,
  );
}

function trapFocus(event) {
  if (event.key !== "Tab" || !dialog?.open) return;
  const nodes = focusables();
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openMerch() {
  if (!dialog) return;
  track("merch_open");
  lastFocus = document.activeElement;
  setStatus("");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  const first = focusables()[0];
  if (first) first.focus();
  document.addEventListener("keydown", trapFocus);
}

function closeMerch() {
  if (!dialog) return;
  document.removeEventListener("keydown", trapFocus);
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
}

async function buy(event) {
  event.preventDefault();
  if (!form || !buyBtn) return;

  const data = new FormData(form);
  const size = String(data.get("size") || "");
  const color = String(data.get("color") || "");
  const email = String(data.get("email") || "").trim();
  const name = String(data.get("name") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const address1 = String(data.get("address1") || "").trim();
  const city = String(data.get("city") || "").trim();
  const state = String(data.get("state") || "").trim();
  const zip = String(data.get("zip") || "").trim();

  if (!SIZES.includes(size) || !COLORS.some((item) => item.id === color)) {
    setStatus("Pick a size and colour.", true);
    return;
  }
  if (!email || !name || !phone || !address1 || !city || !state || !zip) {
    setStatus("Fill every shipping field before Paystack.", true);
    return;
  }

  buyBtn.disabled = true;
  setStatus("Opening Paystack…");
  track("merch_checkout", { size, color });

  try {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size,
        color,
        quantity: 1,
        email,
        name,
        phone,
        address1,
        city,
        state,
        zip,
        country: "NG",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.error || "Checkout is not ready. Set Paystack secrets in Cloudflare.", true);
      return;
    }
    if (!payload.authorization_url) {
      setStatus("Paystack did not return a checkout link.", true);
      return;
    }
    window.location.assign(payload.authorization_url);
  } catch {
    setStatus("Could not reach checkout. Try again on a network.", true);
  } finally {
    buyBtn.disabled = false;
  }
}

if (openBtn) openBtn.addEventListener("click", openMerch);
if (form) form.addEventListener("submit", buy);

dialog?.querySelectorAll("[data-merch-close]").forEach((node) => {
  node.addEventListener("click", closeMerch);
});

dialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMerch();
});

try {
  const params = new URLSearchParams(window.location.search);
  if (params.get("merch") === "paid") {
    openMerch();
    setStatus("Payment received. Printful gets the order after Paystack confirms.");
  }
} catch {
  /* ignore */
}
