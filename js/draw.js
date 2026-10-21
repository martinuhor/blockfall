import { COLS, ROWS, cellsFor, playable } from "./engine.js";

export const DEFAULT_EMOJIS = ["🪨", "👀", "📏", "📐", "🌈"];

const CLAY = "#4A3028";
const RIM = "#7A5344";
const LEDGE = "#8D624F";
const CAVITY = "#1A100E";
const BG = "#140E18";
const FRAMES = 12;
const STRIP_DPR = 2;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const strips = new Map();

function glossFrame(ctx, x, y, size, emoji, spin) {
  const turn = Math.cos(spin);
  const sign = turn < 0 ? -1 : 1;
  const mag = 0.64 + 0.36 * Math.abs(turn);
  ctx.save();
  ctx.translate(x + size / 2 + Math.sin(spin) * size * 0.03, y + size / 2);
  ctx.scale(mag * sign, 1);
  const radius = size * 0.38;
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.92, radius * 0.72, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fill();

  const body = ctx.createRadialGradient(-radius * 0.4, -radius * 0.45, radius * 0.15, 0, 0, radius * 1.05);
  body.addColorStop(0, "#FFF6EA");
  body.addColorStop(0.42, "#E7B072");
  body.addColorStop(1, "#6A3A24");
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeStyle = "rgba(255, 236, 214, 0.7)";
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-radius * 0.28, -radius * 0.34, radius * 0.32, radius * 0.16, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
  ctx.fill();

  ctx.font = `${Math.max(10, Math.floor(size * 0.52))}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji || "●", 0, radius * 0.06);
  ctx.restore();
}

function stripFor(emoji, size) {
  const key = `${emoji}|${size}`;
  const cached = strips.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size * FRAMES * STRIP_DPR);
  canvas.height = Math.ceil(size * STRIP_DPR);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(STRIP_DPR, 0, 0, STRIP_DPR, 0, 0);
  for (let i = 0; i < FRAMES; i++) {
    glossFrame(ctx, i * size, 0, size, emoji, (i / FRAMES) * Math.PI * 2);
  }
  strips.set(key, canvas);
  return canvas;
}

function blitToken(ctx, emoji, x, y, size, time, speed) {
  const frameSize = Math.max(8, Math.round(size));
  const bitmap = stripFor(emoji || "●", frameSize);
  const cycle = 3400 / speed;
  const t = ((time % cycle) + cycle) % cycle;
  const frame = Math.floor((t / cycle) * FRAMES) % FRAMES;
  const tumble = 0.92 + 0.08 * Math.cos(time * 0.00032 * speed);
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(1, tumble);
  ctx.drawImage(
    bitmap,
    frame * frameSize * STRIP_DPR,
    0,
    frameSize * STRIP_DPR,
    frameSize * STRIP_DPR,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

function traceCavity(ctx, ox, oy, cell) {
  const x = (c) => ox + c * cell;
  const y = (r) => oy + r * cell;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.lineTo(x(0), y(10));
  ctx.lineTo(x(1), y(10));
  ctx.lineTo(x(1), y(12));
  ctx.lineTo(x(2), y(12));
  ctx.lineTo(x(2), y(14));
  ctx.lineTo(x(6), y(14));
  ctx.lineTo(x(6), y(12));
  ctx.lineTo(x(7), y(12));
  ctx.lineTo(x(7), y(10));
  ctx.lineTo(x(8), y(10));
  ctx.lineTo(x(8), y(0));
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let cssW = 360;
  let cssH = 520;
  let cell = 32;
  let ox = 0;
  let oy = 0;
  let clock = 0;
  let emojis = DEFAULT_EMOJIS.slice();
  const fx = { shake: 0, flash: 0, particles: [] };

  function layout(width, height) {
    if (width < 80 || height < 80) return;
    cssW = Math.floor(width);
    cssH = Math.floor(height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = Math.max(6, Math.min(28, Math.floor(Math.min(cssW, cssH) * 0.05)));
    cell = Math.floor(Math.min((cssW - pad * 2) / COLS, (cssH - pad * 2) / ROWS));
    cell = Math.max(6, cell);
    const gridW = cell * COLS;
    const gridH = cell * ROWS;
    ox = Math.floor((cssW - gridW) / 2);
    oy = Math.floor((cssH - gridH) / 2);
  }

  function burst(rows) {
    fx.flash = 1;
    fx.shake = 8;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (let c = 0; c < COLS; c++) {
        if (!playable(c, r)) continue;
        fx.particles.push({
          x: ox + c * cell + cell * 0.35,
          y: oy + r * cell + cell * 0.35,
          vx: (Math.random() - 0.5) * cell * 0.45,
          vy: -cell * (0.12 + Math.random() * 0.28),
          s: Math.max(3, cell * 0.2),
          life: 1,
          color: i % 2 === 0 ? "#E0A84A" : "#D9C7A6",
        });
      }
    }
  }

  function tickFx() {
    fx.shake *= 0.8;
    if (fx.shake < 0.35) fx.shake = 0;
    fx.flash *= 0.84;
    if (fx.flash < 0.02) fx.flash = 0;
    for (let i = 0; i < fx.particles.length; i++) {
      const p = fx.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += cell * 0.012;
      p.life -= 0.045;
    }
    if (fx.particles.length) fx.particles = fx.particles.filter((p) => p.life > 0);
  }

  function token(id, x, y, speed) {
    blitToken(ctx, emojis[id] || DEFAULT_EMOJIS[id] || "●", x, y, cell, clock, speed);
  }

  function draw(state) {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = ox + (cell * COLS) / 2;
    const cy = oy + cell * 7;
    const glow = ctx.createRadialGradient(cx, cy, cell, cx, cy, cell * 9);
    glow.addColorStop(0, "rgba(140, 74, 50, 0.28)");
    glow.addColorStop(1, "rgba(20, 14, 24, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssW, cssH);

    const shake = fx.shake || 0;
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, 0);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    traceCavity(ctx, ox, oy, cell);
    ctx.lineWidth = Math.max(6, cell * 0.72);
    ctx.strokeStyle = CLAY;
    ctx.stroke();

    traceCavity(ctx, ox, oy, cell);
    ctx.fillStyle = CAVITY;
    ctx.fill();

    ctx.strokeStyle = "rgba(217, 199, 166, 0.08)";
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!playable(c, r)) continue;
        if (state.board[r * COLS + c] !== 0) continue;
        const px = ox + c * cell + cell / 2;
        const py = oy + r * cell + cell / 2;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, cell * 0.045), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    traceCavity(ctx, ox, oy, cell);
    ctx.lineWidth = 2;
    ctx.strokeStyle = RIM;
    ctx.stroke();

    ctx.strokeStyle = LEDGE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy + 10 * cell);
    ctx.lineTo(ox + cell, oy + 10 * cell);
    ctx.moveTo(ox + cell, oy + 12 * cell);
    ctx.lineTo(ox + 2 * cell, oy + 12 * cell);
    ctx.moveTo(ox + 6 * cell, oy + 12 * cell);
    ctx.lineTo(ox + 7 * cell, oy + 12 * cell);
    ctx.moveTo(ox + 7 * cell, oy + 10 * cell);
    ctx.lineTo(ox + 8 * cell, oy + 10 * cell);
    ctx.stroke();

    if (fx.flash > 0) {
      traceCavity(ctx, ox, oy, cell);
      ctx.fillStyle = `rgba(224, 168, 74, ${fx.flash * 0.22})`;
      ctx.fill();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const value = state.board[r * COLS + c];
        if (!value) continue;
        token(value - 1, ox + c * cell, oy + r * cell, 0.36);
      }
    }

    if (state.piece) {
      const cells = cellsFor(state.piece.id, state.piece.rot, state.piece.col, state.piece.row);
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i][0];
        const r = cells[i][1];
        if (r < -1 || c < 0 || c >= COLS) continue;
        token(state.piece.id, ox + c * cell, oy + r * cell, 1.15);
      }
    }

    for (let i = 0; i < fx.particles.length; i++) {
      const p = fx.particles[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function paintMark(mark, emoji) {
    const css = Math.max(96, Math.round(mark.clientWidth || 168));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.floor(css * dpr);
    if (mark.width !== px) {
      mark.width = px;
      mark.height = px;
    }
    const markCtx = mark.getContext("2d");
    markCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markCtx.clearRect(0, 0, css, css);
    blitToken(markCtx, emoji, css * 0.06, css * 0.04, css * 0.88, clock, 1);
  }

  return {
    layout,
    draw,
    burst,
    tickFx,
    paintMark,
    setClock(ms) {
      clock = ms;
    },
    setEmojis(list) {
      emojis = DEFAULT_EMOJIS.map((fallback, i) => (list && list[i]) || fallback);
      strips.clear();
    },
  };
}
