import { lagosDateKey } from "./engine.js";
import { track } from "./analytics.js";

const HANDLE_KEY = "blockfall.handle";

export function loadHandle() {
  try {
    return localStorage.getItem(HANDLE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveHandle(handle) {
  try {
    localStorage.setItem(HANDLE_KEY, handle);
  } catch {
    /* ignore */
  }
}

export async function fetchBoard(date = lagosDateKey()) {
  const response = await fetch(`/api/leaderboard?date=${encodeURIComponent(date)}`);
  if (!response.ok) throw new Error("board unavailable");
  return response.json();
}

export async function submitReceipt(receipt, handle) {
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      handle,
      seed: receipt.seed,
      inputs: receipt.inputs,
      tick: receipt.tick,
      score: receipt.score,
      bands: receipt.bands,
      hash: receipt.hash,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || "submit failed");
    err.payload = payload;
    throw err;
  }
  return payload;
}

export function mountLeaderboard(root) {
  if (!root) return { refresh() {}, paint() {} };

  const list = root.querySelector("[data-board-list]");
  const meta = root.querySelector("[data-board-meta]");
  const handleInput = root.querySelector("[data-board-handle]");
  if (handleInput) handleInput.value = loadHandle();

  handleInput?.addEventListener("change", () => {
    saveHandle(String(handleInput.value || "").trim().toLowerCase());
  });

  async function refresh() {
    track("board_view");
    if (meta) meta.textContent = "Loading…";
    try {
      const data = await fetchBoard();
      paint(data);
    } catch {
      if (meta) meta.textContent = "Board offline — scores still save on this phone.";
      if (list) list.replaceChildren();
    }
  }

  function paint(data) {
    if (meta) {
      meta.textContent = data.durable
        ? `Lagos ${data.date} · shared board`
        : `Lagos ${data.date} · preview board (bind LEADERBOARD_KV for durable ranks)`;
    }
    if (!list) return;
    list.replaceChildren();
    const entries = data.entries || [];
    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "board-empty";
      empty.textContent = "No ranked runs yet today.";
      list.append(empty);
      return;
    }
    for (const row of entries) {
      const item = document.createElement("li");
      item.innerHTML = `<span class="board-rank">${row.rank}</span><span class="board-handle">${escapeHtml(row.handle)}</span><span class="board-score">${row.score}</span>`;
      list.append(item);
    }
  }

  return { refresh, paint };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
