/* ============================================================
   حياة الحارات — rendering + interface
   ============================================================ */
import { Sim, WORLD, ar, timeLabel, money, KINDS, tod, PLACE_DEFS, CAR_MODELS, CAR_DOWN_RATE, SAVE_KEY } from './sim.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];

const canvas = $('town');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const sim = new Sim();

let VW = 0, VH = 0, dpr = 1;
const cam = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1, fit: 1 };
let selectedId = null;
let hoverId = null;
let showBubbles = true;
let placeId = null;            /* selected building */
let insideId = null;           /* building we are inside */
let insideT = 0;               /* 0..1 enter animation */
let outsideCam = null;
let saveAcc = 0;
const mouse = { x: 0, y: 0, in: false };
let firstStart = true;

/* ------------------------------------------------------------
   colour helpers
   ------------------------------------------------------------ */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function shade(hex, p) {
  const c = hexToRgb(hex);
  const target = p < 0 ? 0 : 255;
  const k = Math.abs(p);
  const r = Math.round(c.r + (target - c.r) * k);
  const g = Math.round(c.g + (target - c.g) * k);
  const b = Math.round(c.b + (target - c.b) * k);
  return `rgb(${r},${g},${b})`;
}
function rr(x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}
function moodColor(m) { return m >= 62 ? '#5f9e6a' : m >= 38 ? '#d3a33f' : '#bc6047'; }

/* ------------------------------------------------------------
   canvas sizing & camera
   ------------------------------------------------------------ */
function resize() {
  const rect = stage.getBoundingClientRect();
  VW = Math.max(1, Math.round(rect.width));
  VH = Math.max(1, Math.round(rect.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
  cam.fit = Math.min(VW / WORLD.w, VH / WORLD.h);
  clampCam();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

function clampCam() {
  const s = cam.fit * cam.zoom;
  const halfW = VW / (2 * s), halfH = VH / (2 * s);
  cam.x = WORLD.w <= halfW * 2 ? WORLD.w / 2 : clamp(cam.x, halfW, WORLD.w - halfW);
  cam.y = WORLD.h <= halfH * 2 ? WORLD.h / 2 : clamp(cam.y, halfH, WORLD.h - halfH);
}
function worldTransform() {
  const s = cam.fit * cam.zoom;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (VW / 2 - cam.x * s), dpr * (VH / 2 - cam.y * s));
}
function screenToWorld(px, py) {
  const s = cam.fit * cam.zoom;
  return { x: cam.x + (px - VW / 2) / s, y: cam.y + (py - VH / 2) / s };
}
function zoomAt(factor, px, py) {
  const before = screenToWorld(px, py);
  cam.zoom = clamp(cam.zoom * factor, 1, 2.8);
  const after = screenToWorld(px, py);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCam();
}
function hitResident(x, y) {
  let best = null, bestD = 24;
  for (const r of sim.residents) {
    const d = Math.hypot(r.x - x, r.y - 12 - y);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/* ------------------------------------------------------------
   static scene bits
   ------------------------------------------------------------ */
const ROADS = { hx0: 0, hx1: WORLD.w, hy0: 380, hy1: 440, vy0: 580, vy1: 660, vx0: 0, vx1: WORLD.h };
const LAMPS = [
  { x: 534, y: 366 }, { x: 705, y: 366 }, { x: 534, y: 454 }, { x: 705, y: 454 },
  { x: 570, y: 200 }, { x: 670, y: 540 }, { x: 300, y: 452 }, { x: 950, y: 366 },
];
const PALMS = [{ x: 508, y: 328 }, { x: 708, y: 328 }, { x: 508, y: 472 }, { x: 708, y: 472 }];
const TABLES = [
  { x: 292, y: 460 }, { x: 330, y: 462 }, { x: 760, y: 460 },
];
const SPECKS = (() => {
  let s = 4241;
  const next = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 560 }, () => ({
    x: next() * WORLD.w, y: next() * WORLD.h, r: 0.5 + next() * 1.7, a: 0.05 + next() * 0.09,
  }));
})();

function drawBlueprint(now) {
  worldTransform();
  const g = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
  g.addColorStop(0, '#e9d8b6');
  g.addColorStop(1, '#dcc79e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.fillStyle = 'rgba(198,170,124,.18)';
  for (const d of SPECKS) {
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }

  /* streets */
  ctx.fillStyle = 'rgba(120,110,96,.28)';
  ctx.fillRect(0, 380, WORLD.w, 60);
  ctx.fillRect(580, 0, 60, WORLD.h);

  ctx.save();
  ctx.strokeStyle = 'rgba(110,86,52,.45)';
  ctx.lineWidth = 0.9;
  ctx.setLineDash([6, 5]);
  for (const p of PLACE_DEFS) {
    rr(p.x, p.y, p.w, p.h, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,132,92,.10)';
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(90,66,36,.4)';
  ctx.font = '700 22px Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('أرض فضاء… جاهزة للحارة', WORLD.w / 2, WORLD.h / 2 + 8);
}

function darkness(min) {
  const t = tod(min);
  if (t >= 6 * 60 && t <= 17 * 60 + 20) return 0;
  if (t > 17 * 60 + 20 && t < 19 * 60 + 30) return ((t - (17 * 60 + 20)) / 130) * 0.55;
  if (t >= 19 * 60 + 30 || t < 5 * 60) return 0.55;
  return clamp(1 - (t - 5 * 60) / 90, 0, 1) * 0.55;
}

/* ------------------------------------------------------------
   drawing: ground + roads
   ------------------------------------------------------------ */
function drawGround(now) {
  const g = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
  g.addColorStop(0, '#ead8b4');
  g.addColorStop(0.5, '#e3d0a9');
  g.addColorStop(1, '#dcc79e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  /* soft sand patches */
  ctx.fillStyle = 'rgba(198,170,124,.16)';
  for (let i = 0; i < 7; i++) {
    const x = (i * 197 + 120) % WORLD.w;
    const y = (i * 263 + 90) % WORLD.h;
    ctx.beginPath();
    ctx.ellipse(x, y, 110 + (i % 3) * 40, 60 + (i % 2) * 30, i, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const d of SPECKS) {
    ctx.fillStyle = `rgba(120,92,52,${d.a})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoads(now) {
  /* sidewalks */
  ctx.fillStyle = '#ddcaa5';
  ctx.fillRect(0, 356, WORLD.w, 104);
  ctx.fillRect(556, 0, 104, WORLD.h);
  ctx.fillStyle = 'rgba(180,155,112,.35)';
  for (let x = 0; x < WORLD.w; x += 26) ctx.fillRect(x, 356, 1.5, 104);
  for (let y = 0; y < WORLD.h; y += 26) ctx.fillRect(556, y, 104, 1.5);

  /* asphalt */
  ctx.fillStyle = '#6d6a62';
  ctx.fillRect(0, 380, WORLD.w, 60);
  ctx.fillRect(580, 0, 60, WORLD.h);

  /* asphalt grain */
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 90; i++) {
    const x = (i * 337) % WORLD.w;
    ctx.fillRect(x, 384 + ((i * 53) % 52), 2.4, 1.4);
  }

  /* curbs */
  ctx.strokeStyle = 'rgba(247,237,214,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 380.5); ctx.lineTo(WORLD.w, 380.5);
  ctx.moveTo(0, 439.5); ctx.lineTo(WORLD.w, 439.5);
  ctx.moveTo(580.5, 0); ctx.lineTo(580.5, 380); ctx.moveTo(659.5, 0); ctx.lineTo(659.5, 380);
  ctx.moveTo(580.5, 440); ctx.lineTo(580.5, WORLD.h); ctx.moveTo(659.5, 440); ctx.lineTo(659.5, WORLD.h);
  ctx.stroke();

  /* dashed centre lines */
  ctx.save();
  ctx.strokeStyle = 'rgba(246,232,198,.6)';
  ctx.lineWidth = 2.6;
  ctx.setLineDash([18, 15]);
  ctx.beginPath();
  ctx.moveTo(0, 410); ctx.lineTo(566, 410);
  ctx.moveTo(674, 410); ctx.lineTo(WORLD.w, 410);
  ctx.moveTo(610, 0); ctx.lineTo(610, 366);
  ctx.moveTo(610, 454); ctx.lineTo(610, WORLD.h);
  ctx.stroke();
  ctx.restore();

  /* crosswalks */
  ctx.fillStyle = 'rgba(240,231,208,.45)';
  for (const cx of [430, 700]) {
    for (let i = 0; i < 5; i++) ctx.fillRect(cx + i * 13, 383, 7, 54);
  }
  for (const cy of [130, 700]) {
    for (let i = 0; i < 4; i++) ctx.fillRect(583, cy + i * 13, 54, 7);
  }

  /* manholes */
  for (const m of [{ x: 250, y: 416 }, { x: 930, y: 405 }, { x: 610, y: 120 }, { x: 610, y: 690 }]) {
    ctx.fillStyle = '#5b574e';
    ctx.beginPath(); ctx.arc(m.x, m.y, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.stroke();
  }

  /* world frame */
  ctx.strokeStyle = 'rgba(90,66,36,.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, WORLD.w - 6, WORLD.h - 6);
}

/* ------------------------------------------------------------
   drawing: street props
   ------------------------------------------------------------ */
function drawLamp(x, y, t, night) {
  ctx.save();
  ctx.strokeStyle = '#4e463a';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.lineTo(x + 9, y - 30); ctx.stroke();
  const glowOn = night > 0.15 && !sim.powerCut;
  ctx.fillStyle = glowOn ? '#ffd98e' : '#8d8168';
  ctx.beginPath(); ctx.arc(x + 10, y - 30, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPalm(x, y, t, i) {
  ctx.save();
  const sway = Math.sin(t * 1.2 + i) * 2.2;
  ctx.strokeStyle = '#7c5f3b';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 2, y - 18, x + sway, y - 34);
  ctx.stroke();
  ctx.fillStyle = '#4f7a45';
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.52 + Math.sin(t + i) * 0.03;
    ctx.beginPath();
    ctx.ellipse(x + sway + Math.cos(a) * 12, y - 34 + Math.sin(a) * 11, 12, 3.6, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3f6338';
  ctx.beginPath(); ctx.arc(x + sway, y - 35, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawStreetLife(t, night) {
  /* a tea cart on the sidewalk */
  const cx = 322, cy = 366;
  ctx.fillStyle = 'rgba(70,50,28,.2)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 14, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d5f3b';
  rr(cx - 15, cy - 4, 30, 16, 3); ctx.fill();
  ctx.fillStyle = '#c9a25f';
  rr(cx - 17, cy - 8, 34, 6, 3); ctx.fill();
  ctx.fillStyle = '#4b3a29';
  ctx.beginPath(); ctx.arc(cx - 10, cy + 13, 3.4, 0, Math.PI * 2); ctx.arc(cx + 10, cy + 13, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0c78f';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 11, 3, 0, Math.PI * 2); ctx.arc(cx + 3, cy - 12, 3, 0, Math.PI * 2); ctx.fill();

  /* string lights across the main street */
  /* زينة معلّقة بين البيوت فوق الشارع (بتتدلدل من النص) */
  const buntingSkip = sim.activeStreetMatch();
  for (const sx of [300, 940]) {
    /* مش بنعلّق زينة في وش ماتش الكورة */
    if (buntingSkip && Math.abs((buntingSkip.area.x + buntingSkip.area.w / 2) - sx) < 130) continue;
    const x0 = sx - 46, x1 = sx + 46, yTop = 344, ySag = 376;
    ctx.strokeStyle = 'rgba(60,48,34,.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.quadraticCurveTo(sx, ySag, x1, yTop);
    ctx.stroke();
    for (let i = 1; i < 7; i++) {
      const k = i / 7;
      const x = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * sx + k * k * x1;
      const y = (1 - k) * (1 - k) * yTop + 2 * (1 - k) * k * ySag + k * k * yTop;
      const on = night > 0.2;
      ctx.fillStyle = on ? 'rgba(255,206,116,.95)' : 'rgba(238,225,192,.7)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(255,196,96,.18)';
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* two cars crawling down the main street — بتقف لو فيه كورة في الشارع */
  const span = WORLD.w + 280;
  const clock = sim.trafficClock != null ? sim.trafficClock : sim.minute;
  const carAX = holdForGame(((clock * 1.5) % span) - 140, 1);
  const carBX = holdForGame(span - ((clock * 1.15 + 760) % span) - 140, -1);
  drawCar(carAX, 397, 1, '#f2ede0', night);
  drawCar(carBX, 423, -1, '#8fb6bd', night);

  /* parked tuk-tuk by the garage */
  drawTukTuk(462, 618, t);

  /* cat */
  const catX = 246 + Math.sin(t * 0.7) * 12, catY = 470;
  ctx.fillStyle = '#b98b52';
  ctx.beginPath(); ctx.ellipse(catX, catY, 6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(catX + 5, catY - 2.6, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b98b52'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(catX - 6, catY); ctx.quadraticCurveTo(catX - 12, catY - 5, catX - 9, catY - 8); ctx.stroke();

  /* café tables */
  for (const tb of TABLES) {
    ctx.fillStyle = 'rgba(60,44,26,.18)';
    ctx.beginPath(); ctx.ellipse(tb.x, tb.y + 8, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b543a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tb.x, tb.y); ctx.lineTo(tb.x, tb.y + 8); ctx.stroke();
    ctx.fillStyle = '#a9784f';
    ctx.beginPath(); ctx.ellipse(tb.x, tb.y, 9, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function holdForGame(x, dir) {
  const m = sim.activeStreetMatch && sim.activeStreetMatch();
  if (!m) return x;
  const a = m.area;
  const left = a.x - 26, right = a.x + a.w + 26;
  if (dir > 0 && x > left - 54 && x < right) return left - 54;
  if (dir < 0 && x < right + 54 && x > left) return right + 54;
  return x;
}

function drawCar(x, y, dir, color, night, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = 'rgba(60,44,26,.22)';
  ctx.beginPath(); ctx.ellipse(0, 9, 21, 4.4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = color;
  rr(-20, -6, 40, 14, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(45,32,18,.35)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = shade(color, -0.22);
  rr(-9, -14, 21, 10, 3); ctx.fill();
  ctx.fillStyle = 'rgba(140,182,198,.85)';
  rr(-7, -12.5, 7, 6, 1.5); ctx.fill();
  rr(1.5, -12.5, 8, 6, 1.5); ctx.fill();

  if (!opts.plain) {
    /* cairo taxi checker */
    ctx.fillStyle = 'rgba(40,32,24,.75)';
    ctx.fillRect(-18, 0, 36, 2.4);
    ctx.fillStyle = 'rgba(250,246,232,.85)';
    for (let i = 0; i < 6; i++) ctx.fillRect(-18 + i * 6 + 3, 0, 3, 2.4);

    /* roof sign */
    ctx.fillStyle = '#e3c277';
    rr(-5, -18, 10, 4, 1.5); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    rr(-9, -14.5, 21, 1.6, 1); ctx.fill();
  }

  ctx.fillStyle = '#2b2620';
  ctx.beginPath();
  ctx.arc(-12, 8, 4.6, 0, Math.PI * 2);
  ctx.arc(12, 8, 4.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = night > 0.2 ? '#ffe9a8' : '#ece4cb';
  ctx.beginPath(); ctx.arc(19, -2, 2, 0, Math.PI * 2); ctx.fill();
  if (night > 0.2) {
    const gl = ctx.createRadialGradient(30, -2, 1, 30, -2, 34);
    gl.addColorStop(0, 'rgba(255,220,150,.35)');
    gl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(30, -2, 34, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTukTuk(x, y, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(60,44,26,.2)';
  ctx.beginPath(); ctx.ellipse(x, y + 10, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f8a7e';
  rr(x - 15, y - 10, 30, 18, 5); ctx.fill();
  ctx.fillStyle = '#f0d9a8';
  rr(x - 7, y - 12, 14, 9, 3); ctx.fill();
  ctx.fillStyle = '#2b2620';
  ctx.beginPath(); ctx.arc(x - 9, y + 9, 4.2, 0, Math.PI * 2); ctx.arc(x + 10, y + 9, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9b64f';
  ctx.beginPath(); ctx.arc(x + 14, y - 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------
   drawing: buildings
   ------------------------------------------------------------ */
function drawSign(p) {
  const { x, y, w } = p;
  if (p.style === 'pitch') return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = 11;
  ctx.font = `700 ${fs}px Cairo, sans-serif`;
  let tw = ctx.measureText(p.name).width;
  const maxW = Math.max(48, w - 18);
  if (tw > maxW) {
    fs = Math.max(7.4, fs * maxW / tw);
    ctx.font = `700 ${fs}px Cairo, sans-serif`;
    tw = ctx.measureText(p.name).width;
  }
  const bw = Math.min(maxW, tw + 15);
  const bx = x + (w - bw) / 2, by = y + 7, bh = 17;
  ctx.fillStyle = 'rgba(45,32,20,.9)';
  rr(bx, by, bw, bh, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(229,174,77,.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f2d9a4';
  ctx.fillText(p.name, x + w / 2, by + bh / 2 + 0.5);
  ctx.restore();
}

function drawWindows(p, lit) {
  const { x, y, w, h } = p;
  const cols = Math.max(2, Math.round((w - 26) / 36));
  const rows = Math.max(1, Math.round((h - 62) / 38));
  const gx = (w - 26) / cols, gy = (h - 58) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ww = 14, wh = 17;
      const wx = x + 16 + col * gx + (gx - ww) / 2;
      const wy = y + 30 + row * gy + (gy - wh) / 2;
      if (wy + wh > y + h - 12) continue;
      const on = lit && ((p.seed + row * 5 + col * 11) % 7 !== 0);
      ctx.fillStyle = 'rgba(48,34,21,.5)';
      rr(wx - 1.5, wy - 1.5, ww + 3, wh + 3, 2.5); ctx.fill();
      ctx.fillStyle = on ? '#f6cb7d' : 'rgba(90,110,116,.92)';
      rr(wx, wy, ww, wh, 2); ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(255,214,140,.22)';
        rr(wx - 3, wy - 3, ww + 6, wh + 6, 4); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(50,36,22,.32)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
    }
  }
}

/* كل باب بيتفتح ويتقفل مع أنيميشن الدخول/الخروج */
let DOORS = new Map();
function computeDoors() {
  DOORS = new Map();
  for (const r of sim.residents) {
    if (!r.anim) continue;
    const pr = clamp(r.anim.t / 1.15, 0, 1);
    const k = Math.sin(pr * Math.PI);
    DOORS.set(r.anim.placeId, Math.max(DOORS.get(r.anim.placeId) || 0, k));
  }
}

function drawDoor(p) {
  const { x, y, w, h } = p;
  const dx = x + w / 2;
  const dw = p.style === 'garage' ? 44 : 17;
  const dh = p.style === 'garage' ? 34 : 24;
  const isMetal = ['workshop', 'garage', 'office', 'pharmacy'].includes(p.style);
  ctx.fillStyle = 'rgba(52,38,22,.22)';
  rr(dx - dw / 2 - 3, y + h - 1, dw + 6, 4, 2); ctx.fill();

  ctx.fillStyle = '#3d2b1a';
  rr(dx - dw / 2 - 2, y + h - dh - 2, dw + 4, dh + 2, 6); ctx.fill();

  const openK = DOORS.get(p.id) || 0;
  if (openK > 0.2) {
    /* الباب مفتوح: فتحة ضلمة جوه + ضلفة متنية على الجنب */
    ctx.fillStyle = '#211a13';
    rr(dx - dw / 2, y + h - dh, dw, dh, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,206,128,.20)';
    rr(dx - dw / 2 + 2, y + h - dh + 2, dw - 4, dh * 0.5, 3); ctx.fill();
  }

  const g = ctx.createLinearGradient(0, y + h - dh, 0, y + h);
  if (isMetal) { g.addColorStop(0, '#7d94a3'); g.addColorStop(1, '#546b7a'); }
  else { g.addColorStop(0, '#95623a'); g.addColorStop(1, '#6e4526'); }
  ctx.fillStyle = g;
  const leafW = Math.max(2, dw * (1 - openK * 0.88));
  rr(dx - dw / 2 + (openK > 0.5 ? dw * 0.55 : 0), y + h - dh, leafW, dh, 4); ctx.fill();
  if (isMetal) {
    ctx.strokeStyle = 'rgba(35,48,58,.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(dx - dw / 2 + 2, y + h - dh + i * (dh / 4));
      ctx.lineTo(dx + dw / 2 - 2, y + h - dh + i * (dh / 4));
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#e6c272';
    ctx.beginPath(); ctx.arc(dx + 4, y + h - dh / 2, 1.4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawAwning(cx, y, w, c1 = '#bf5540', c2 = '#f2e3c4') {
  const n = Math.max(6, Math.round(w / 9));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? c2 : c1;
    ctx.fillRect(cx - w / 2 + i * sw, y, sw, 8);
  }
  ctx.fillStyle = 'rgba(50,34,20,.25)';
  ctx.fillRect(cx - w / 2, y + 8, w, 1.6);
}

function drawPlaceExtras(p, now, night) {
  const { x, y, w, h } = p;
  const t = now / 1000;
  const doorX = p.door.x;

  switch (p.style) {
    case 'dealer': {
      /* واجهة زجاج + عربيتين معروضين + يافطة مفتوح */
      ctx.fillStyle = 'rgba(180,215,228,.55)';
      rr(x + 12, y + h - 52, w - 24, 34, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(60,90,105,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 12 + i * ((w - 24) / 3), y + h - 52);
        ctx.lineTo(x + 12 + i * ((w - 24) / 3), y + h - 18);
        ctx.stroke();
      }
      /* عربيتين واقفين قصاد المعرض */
      ctx.save();
      ctx.globalAlpha = 0.95;
      drawCar(x + 26, y + h + 12, 1, '#c94f43', 0, { plain: true });
      drawCar(x + w - 30, y + h + 12, -1, '#e8e0cd', 0, { plain: true });
      ctx.restore();
      drawAwning(doorX, y + h - 36, 70, '#3f7f8f', '#efe6cc');
      break;
    }
    case 'police': {
      /* لوحة صغيرة + شرطة على السطح + علامة النجمة */
      ctx.fillStyle = '#2f4f74';
      rr(x + w - 34, y + 16, 22, 16, 3); ctx.fill();
      ctx.fillStyle = '#f2e6c8';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const a2 = a1 + Math.PI / 5;
        ctx.lineTo(x + w - 23 + Math.cos(a1) * 6, y + 24 + Math.sin(a1) * 6);
        ctx.lineTo(x + w - 23 + Math.cos(a2) * 2.6, y + 24 + Math.sin(a2) * 2.6);
      }
      ctx.closePath(); ctx.fill();
      /* إشارة فوق السطح */
      const blink = Math.sin(t * 3) > 0;
      ctx.fillStyle = blink ? '#d44a3a' : '#3f6fb0';
      ctx.beginPath(); ctx.arc(x + w / 2, y - 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? 'rgba(212,74,58,.25)' : 'rgba(63,111,176,.25)';
      ctx.beginPath(); ctx.arc(x + w / 2, y - 5, 11, 0, Math.PI * 2); ctx.fill();
      /* سيف ونجمة بسيطة على الحيطة */
      ctx.strokeStyle = 'rgba(240,232,208,.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x + 22, y + h - 34, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 22, y + h - 40); ctx.lineTo(x + 22, y + h - 28); ctx.stroke();
      break;
    }
    case 'apartment': {
      /* roof tank + dish + laundry */
      ctx.fillStyle = '#b8b3a5';
      rr(x + w - 30, y - 6, 15, 11, 2); ctx.fill();
      ctx.strokeStyle = '#8d887b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w - 29, y - 2); ctx.lineTo(x + w - 16, y - 2); ctx.stroke();
      ctx.strokeStyle = '#6c6558'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x + 22, y + 24); ctx.lineTo(x + 18, y + 10); ctx.stroke();
      ctx.fillStyle = '#e3ded1';
      ctx.beginPath(); ctx.ellipse(x + 17, y + 9, 7.5, 4.6, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a9a294'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#8d8677';
      ctx.beginPath(); ctx.arc(x + 15.5, y + 8, 1.4, 0, Math.PI * 2); ctx.fill();
      /* balcony ledge */
      ctx.fillStyle = shade(p.color, -0.3);
      rr(x + 8, y + h - 7, w - 16, 4, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(70,52,32,.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const bx = x + 16 + i * ((w - 32) / 3.2);
        ctx.beginPath(); ctx.moveTo(bx, y + h - 16); ctx.lineTo(bx, y + h - 7); ctx.stroke();
      }
      break;
    }
    case 'shop':
    case 'kiosk': {
      ctx.fillStyle = '#a8773f';
      rr(x + 8, y + h - 13, 16, 10, 2); ctx.fill();
      ctx.fillStyle = '#8a5c2c';
      rr(x + 26, y + h - 11, 14, 8, 2); ctx.fill();
      break;
    }
    case 'bakery': {
      /* chimney + steam */
      ctx.fillStyle = '#8c6a4b';
      rr(x + w - 26, y - 14, 10, 20, 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.45 + i / 3) % 1);
        ctx.fillStyle = `rgba(240,233,216,${0.3 * (1 - ph)})`;
        ctx.beginPath();
        ctx.arc(x + w - 21 + Math.sin(ph * 7 + i) * 5, y - 18 - ph * 26, 4 + ph * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      drawAwning(doorX, y + h - 36, 56, '#b3653e');
      break;
    }
    case 'cafe': {
      drawAwning(doorX, y + h - 36, 66, '#4f7f72', '#efe0c2');
      /* shisha + stools under the awning */
      ctx.fillStyle = '#c9a25f';
      ctx.beginPath(); ctx.arc(doorX - 22, y + h - 6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5c4a34';
      ctx.beginPath(); ctx.arc(doorX + 20, y + h - 4, 4.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'workshop': {
      ctx.fillStyle = '#6b4f33';
      rr(doorX - 26, y + 24, 52, 9, 3); ctx.fill();
      ctx.fillStyle = '#8f8d85';
      rr(x + w - 26, y + h - 12, 16, 8, 2); ctx.fill();
      ctx.fillStyle = '#c9a24a';
      ctx.beginPath(); ctx.arc(x + 16, y + h - 6, 3.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'office': {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        rr(x + 12 + i * ((w - 24) / 4), y + h - 30, 7, 30, 3); ctx.fill();
      }
      break;
    }
    case 'pharmacy': {
      ctx.fillStyle = '#f4f0e4';
      rr(doorX + 28, y + 18, 24, 24, 5); ctx.fill();
      ctx.fillStyle = '#3f8a5c';
      rr(doorX + 37, y + 22, 6, 16, 1.5); ctx.fill();
      rr(doorX + 32, y + 27, 16, 6, 1.5); ctx.fill();
      break;
    }
    case 'mosque': {
      /* drum + dome */
      ctx.fillStyle = shade(p.color, -0.12);
      rr(x + w / 2 - 34, y - 6, 68, 12, 3); ctx.fill();
      const domeGrad = ctx.createLinearGradient(x + w / 2 - 30, y - 34, x + w / 2 + 30, y - 4);
      domeGrad.addColorStop(0, '#e8dcc0');
      domeGrad.addColorStop(1, '#b9a988');
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y - 5, 31, 29, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,100,70,.4)'; ctx.lineWidth = 1; ctx.stroke();
      /* crescent */
      ctx.fillStyle = '#cbb87f';
      ctx.beginPath(); ctx.arc(x + w / 2, y - 38, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(p.color, 0.35);
      ctx.beginPath(); ctx.arc(x + w / 2 + 1.4, y - 39, 2.6, 0, Math.PI * 2); ctx.fill();
      /* minaret */
      ctx.fillStyle = shade(p.color, -0.06);
      rr(x + w - 30, y - 52, 16, h + 52, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(x + w - 27, y - 50, 3, h + 46);
      ctx.fillStyle = '#a89a78';
      rr(x + w - 34, y - 40, 24, 6, 2); ctx.fill();
      rr(x + w - 33, y - 56, 22, 7, 2); ctx.fill();
      ctx.fillStyle = '#d8c89f';
      ctx.beginPath(); ctx.arc(x + w - 22, y - 61, 4.2, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8f8261';
      ctx.beginPath(); ctx.moveTo(x + w - 22, y - 70); ctx.lineTo(x + w - 24, y - 62); ctx.lineTo(x + w - 20, y - 62); ctx.closePath(); ctx.fill();
      break;
    }
    case 'school': {
      /* flag */
      ctx.strokeStyle = '#6b5c44'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 16, y - 6); ctx.lineTo(x + 16, y - 40); ctx.stroke();
      ctx.fillStyle = '#c8443c'; ctx.fillRect(x + 17, y - 40, 22, 7);
      ctx.fillStyle = '#f2ecdf'; ctx.fillRect(x + 17, y - 33, 22, 7);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + 17, y - 26, 22, 7);
      break;
    }
    case 'garage': {
      ctx.fillStyle = '#8f8d85';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 8, y + h - 8 - i * 8, 5.4, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#5c5a54' : '#77756d';
        ctx.fill();
      }
      break;
    }
    case 'market': {
      /* umbrellas + crates */
      for (let i = 0; i < 3; i++) {
        const ux = x + 30 + i * 52;
        ctx.strokeStyle = '#7a6a4e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ux, y + h); ctx.lineTo(ux, y + h - 22); ctx.stroke();
        ctx.fillStyle = ['#c85b4b', '#4f8a72', '#d8a63f'][i % 3];
        ctx.beginPath(); ctx.arc(ux, y + h - 22, 16, Math.PI, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#a97a42';
      rr(x + 10, y + h - 9, 18, 9, 2); ctx.fill();
      break;
    }
    case 'charity': {
      ctx.fillStyle = 'rgba(247,237,214,.9)';
      rr(doorX - 34, y + h - 40, 68, 16, 4); ctx.fill();
      ctx.fillStyle = '#7d6647';
      ctx.font = '700 9px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('لقمة عيش', doorX, y + h - 29);
      break;
    }
    case 'youth': {
      ctx.strokeStyle = '#5a5f52'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w - 24, y + h);
      ctx.lineTo(x + w - 24, y + h - 40);
      ctx.lineTo(x + w - 12, y + h - 40);
      ctx.stroke();
      ctx.strokeStyle = '#c96a3c'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x + w - 13, y + h - 35, 4.6, 0, Math.PI * 2); ctx.stroke();
      break;
    }
  }
}

/* ------------------------------------------------------------
   building lots, construction sites, shop state props
   ------------------------------------------------------------ */
function drawLot(p, now, night) {
  const { x, y, w, h } = p;
  const t = now / 1000;
  const pr = p.project;

  /* dirt */
  ctx.fillStyle = '#cbb083';
  rr(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(140,110,70,.55)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  /* gravel */
  for (let i = 0; i < 14; i++) {
    const gx = x + 10 + ((i * 37 + p.seed * 13) % (w - 20));
    const gy = y + 12 + ((i * 53 + p.seed * 7) % (h - 24));
    ctx.fillStyle = 'rgba(120,96,62,.25)';
    ctx.beginPath(); ctx.arc(gx, gy, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  if (!pr) {
    /* empty lot sign */
    const bx = x + w / 2, by = y + h / 2 - 8;
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(bx, by + 8); ctx.lineTo(bx, by + 24); ctx.stroke();
    ctx.fillStyle = 'rgba(248,240,222,.95)';
    rr(bx - 34, by - 12, 68, 22, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(90,66,36,.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#5a4530';
    ctx.font = '700 8.4px Cairo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('أرض للبناء', bx, by - 1);
    return;
  }

  /* construction: scaffolding + growing walls */
  const prog = pr.progress / 100;
  const floors = 1 + prog * 2;
  const bw = w * 0.66, bh = h * 0.42 * Math.min(2.4, floors);
  const bx = x + (w - bw) / 2, by = y + h - 18 - bh;

  ctx.fillStyle = 'rgba(60,44,24,.18)';
  rr(bx + 5, by + 6, bw, bh, 4); ctx.fill();
  ctx.fillStyle = shade('#c9a978', 0.05 - clamp((night || 0) * 0.4, 0, 0.25));
  rr(bx, by, bw, bh, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(90,66,36,.4)'; ctx.lineWidth = 1; ctx.stroke();

  /* brick courses */
  ctx.strokeStyle = 'rgba(120,90,55,.28)';
  ctx.lineWidth = 0.8;
  for (let yy = by + 7; yy < by + bh - 2; yy += 7) {
    ctx.beginPath(); ctx.moveTo(bx + 2, yy); ctx.lineTo(bx + bw - 2, yy); ctx.stroke();
  }

  /* finished floors: slabs + window holes */
  const fh = bh / floors;
  const doneFloors = Math.floor(floors);
  for (let f = 0; f < doneFloors; f++) {
    const fb = by + bh - f * fh;
    const ft = fb - fh;
    for (const wx of [0.26, 0.6]) {
      ctx.fillStyle = 'rgba(54,66,76,.72)';
      rr(bx + bw * wx, ft + fh * 0.26, bw * 0.15, fh * 0.36, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(240,232,214,.35)'; ctx.lineWidth = 0.8;
      rr(bx + bw * wx, ft + fh * 0.26, bw * 0.15, fh * 0.36, 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150,120,82,.9)';
    rr(bx - 3, fb - 3, bw + 6, 4.4, 1.6); ctx.fill();
  }

  /* bricks + tools at the base */
  ctx.fillStyle = 'rgba(160,104,74,.9)';
  for (let i = 0; i < 4; i++) {
    rr(bx + bw + 12 + (i % 2) * 8, y + h - 16 - Math.floor(i / 2) * 5, 9, 4.4, 1); ctx.fill();
  }

  /* scaffold: two poles on the right edge with rungs (kept off the facade) */
  const topY = Math.max(y + 8, by - 16);
  ctx.strokeStyle = 'rgba(120,96,64,.8)';
  ctx.lineWidth = 1.4;
  for (const poleX of [bx + bw + 5, bx + bw + 11]) {
    ctx.beginPath(); ctx.moveTo(poleX, y + h - 10); ctx.lineTo(poleX, topY); ctx.stroke();
  }
  for (let yy = y + h - 16; yy > topY; yy -= 10) {
    ctx.beginPath(); ctx.moveTo(bx + bw + 5, yy); ctx.lineTo(bx + bw + 11, yy - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw + 11, yy); ctx.lineTo(bx + bw + 5, yy - 3); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,66,36,.45)'; ctx.lineWidth = 1.2;
  rr(bx, by, bw, bh, 3); ctx.stroke();

  /* progress bar above the site */
  const barW = w * 0.7, barX = x + (w - barW) / 2, barY = y + 8;
  ctx.fillStyle = 'rgba(38,28,16,.62)';
  rr(barX - 4, barY - 4, barW + 8, 12, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  rr(barX, barY, barW, 4.4, 3); ctx.fill();
  ctx.fillStyle = '#e2b466';
  rr(barX, barY, Math.max(1.5, barW * prog), 4.4, 3); ctx.fill();
  ctx.font = '800 8.4px Cairo, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(38,28,16,.7)';
  ctx.strokeText(`${ar(Math.round(pr.progress))}٪ — ${pr.name}`, x + w / 2, barY + 8.5);
  ctx.fillStyle = '#f7e9c8';
  ctx.fillText(`${ar(Math.round(pr.progress))}٪ — ${pr.name}`, x + w / 2, barY + 8.5);

  /* dust puffs while active */
  if (sim.workerAt(p.id)) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1;
      ctx.fillStyle = `rgba(226,208,176,${0.32 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(bx + 10 + Math.sin(ph * 6 + i) * 12, by + bh - ph * 16, 3 + ph * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawShopProps(p, now, night) {
  if (!p.counter) return;
  const staff = sim.staffOf(p).find(x => x.worker);
  const worker = staff ? staff.worker : null;
  const state = worker && worker.duty ? worker.duty.state : null;

  /* stove behind the counter */
  const sx = p.door.x - 27, sy = p.door.y - 1;
  ctx.fillStyle = '#5c5347';
  rr(sx - 7, sy - 10, 14, 10, 2); ctx.fill();
  ctx.fillStyle = '#8a8175';
  rr(sx - 5, sy - 12, 10, 3, 1.6); ctx.fill();
  if (state === 'cook') {
    const fl = 0.6 + Math.sin(now / 120) * 0.4;
    ctx.fillStyle = `rgba(255,150,60,${0.55 + fl * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy - 2);
    ctx.quadraticCurveTo(sx, sy - 8 - fl * 3, sx + 3, sy - 2);
    ctx.fill();
    for (let i = 0; i < 2; i++) {
      const ph = ((now / 900 + i / 2) % 1);
      ctx.fillStyle = `rgba(240,235,220,${0.22 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(sx + Math.sin(ph * 6) * 3, sy - 12 - ph * 16, 2 + ph * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* status tag (only when the camera is close enough to read it) */
  const st = sim.shopStatus(p);
  const near = cam.fit * cam.zoom >= 1.45;
  if (!st.open && near) {
    const label = st.reason === 'empty' ? 'خلص الأكل' : st.reason === 'no-staff' ? 'مقفول' : 'مقفول';
    ctx.fillStyle = 'rgba(150,58,40,.88)';
    const tw = 20;
    rr(p.door.x + 18, p.door.y - 26, tw * 1.6, 9, 3); ctx.fill();
    ctx.fillStyle = '#fcecd8';
    ctx.font = '700 5.6px Cairo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.door.x + 18 + tw * 0.8, p.door.y - 21.4);
  }
}

/* ------------------------------------------------------------
   little state chips above people
   ------------------------------------------------------------ */
function agentState(r) {
  const t = r.task;
  if (!t) return null;
  const place = sim.getPlace(t.placeId);
  if (t.kind === 'work' && place) {
    if (sim.foodPlace(place)) {
      const st = r.duty && r.duty.state;
      if (st === 'cook') return { icon: '🔥', label: 'بيطبخ', tone: 'work' };
      if (st === 'carry') return { icon: '🍽️', label: 'شايل الأكل', tone: 'work' };
      return { icon: '🤝', label: 'بيخدم', tone: 'work' };
    }
    if (place.kind === 'land') return { icon: '🔨', label: 'بيشتغل في البناء', tone: 'work' };
  }
  if (t.kind === 'buy') {
    if (t.stage === 'queue') return { icon: '🧍', label: 'في الطابور', tone: 'wait' };
    if (t.stage === 'order') return { icon: '🗣️', label: 'بيطلب', tone: 'wait' };
    if (t.stage === 'pay') return { icon: '💰', label: 'بيدفع', tone: 'wait' };
    if (t.stage === 'eat') return { icon: '🍽️', label: 'بياكل', tone: 'eat' };
  }
  if (t.kind === 'school') return { icon: '🎒', label: 'في المدرسة', tone: 'eat' };
  return null;
}

let chipRects = [];
function paintChip(x, y, icon, label, tone) {
  const font = '700 7.6px Cairo, sans-serif';
  ctx.font = font;
  const text = `${icon} ${label}`;
  const tw = ctx.measureText(text).width;
  const w = tw + 12, h = 12;
  /* نرفع الشريحة فوق اللي قبلها لو هتتراكب (زحمة عند المحل) */
  let top = y - h;
  for (let i = 0; i < 5; i++) {
    const clash = chipRects.some(q =>
      Math.abs(q.x + q.w / 2 - x) < (q.w + w) / 2 - 4 &&
      Math.abs(q.y + q.h / 2 - (top + h / 2)) < q.h / 2 + h / 2 + 1);
    if (!clash) break;
    top -= h + 2;
  }
  const bg = tone === 'work' ? 'rgba(38,74,66,.92)' : tone === 'wait' ? 'rgba(74,58,30,.92)' : 'rgba(60,48,34,.88)';
  ctx.fillStyle = bg;
  rr(x - w / 2, top, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,210,.28)'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = '#f6ecd8';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + h / 2 + 0.4);
  chipRects.push({ x: x - w / 2, y: top, w, h });
}

function drawStateChips(now) {
  const zoom = cam.fit * cam.zoom;
  chipRects = [];
  const served = new Map();
  for (const r of sim.residents) {
    const st = agentState(r);
    if (!st) continue;
    const isSel = r.id === selectedId || r.id === hoverId;
    const isStaff = r.task && r.task.kind === 'work';
    const place = sim.getPlace(r.task.placeId);
    const customerNearCounter = r.task.kind === 'buy' && ['order', 'pay'].includes(r.task.stage);
    if (customerNearCounter) {
      const n = served.get(r.task.placeId) || 0;
      if (n >= 1) continue;
      served.set(r.task.placeId, n + 1);
    }
    if (!isSel && !isStaff && !customerNearCounter) continue;
    if (!isSel && zoom < 1.25) continue;
    paintChip(r.x, r.y - 45, st.icon, st.label, st.tone);
  }
}

/* ------------------------------------------------------------
   interiors
   ------------------------------------------------------------ */
const INSIDE = { w: 980, h: 470 };

function enterPlace(id) {
  const p = sim.getPlace(id);
  if (!p || p.kind === 'land') { sim.toast('الأرض دي لسه فاضية… ابدأ بناء الأول'); return; }
  outsideCam = { x: cam.x, y: cam.y, zoom: cam.zoom };
  insideId = id;
  insideT = 0;
  placeId = id;
  sim.insideId = id;
  $('insideBar').hidden = false;
  $('insideName').textContent = p.name;
  $('insideSub').textContent = sim.foodPlace(p) ? sim.shopStatus(p).label : p.kind === 'home' ? 'عمارة سكنية' : 'من جوه';
  $('insideIcon').textContent = p.style === 'apartment' ? '🏠' : p.style === 'cafe' ? '☕' : p.style === 'mosque' ? '🕌' : '🏪';
  $('toast').classList.remove('show');
  hoverId = null;
}

function exitPlace() {
  if (!insideId) return;
  insideId = null;
  sim.insideId = null;
  $('insideBar').hidden = true;
  if (outsideCam) { cam.x = outsideCam.x; cam.y = outsideCam.y; cam.zoom = outsideCam.zoom; clampCam(); }
}

function interiorLayout() {
  const rw = Math.min(VW - 40, 940);
  const rh = Math.min(VH - 150, 500);
  const rx = (VW - rw) / 2;
  const ry = (VH - rh) / 2 + 18;
  return { rw, rh, rx, ry };
}

function drawInterior(now) {
  const place = sim.getPlace(insideId);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#14100b';
  ctx.fillRect(0, 0, VW, VH);
  if (!place) { exitPlace(); return; }

  insideT = Math.min(1, insideT + 0.06);
  const { rw, rh, rx, ry } = interiorLayout();
  const fw = sim.foodPlace(place);
  const status = sim.shopStatus(place);

  /* room shell */
  ctx.save();
  ctx.translate(rx, ry);
  ctx.globalAlpha = 0.35 + 0.65 * insideT;

  const wallGrad = ctx.createLinearGradient(0, 0, 0, rh);
  wallGrad.addColorStop(0, '#3c2e1e');
  wallGrad.addColorStop(1, '#251c13');
  ctx.fillStyle = wallGrad;
  rr(0, 0, rw, rh, 16); ctx.fill();

  ctx.save();
  ctx.beginPath(); rr(0, 0, rw, rh, 16); ctx.clip();

  /* floor */
  ctx.fillStyle = '#6b5137';
  ctx.fillRect(0, rh * 0.42, rw, rh * 0.58);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.05)';
    const py = rh * 0.42 + i * (rh * 0.58 / 22);
    ctx.fillRect(0, py, rw, rh * 0.58 / 22 - 1);
  }
  ctx.fillStyle = 'rgba(255,220,170,.09)';
  ctx.fillRect(0, rh * 0.42 - 6, rw, 6);

  /* back-wall shelves */
  ctx.fillStyle = 'rgba(255,255,255,.055)';
  for (let i = 0; i < 3; i++) ctx.fillRect(rw * 0.06 + i * rw * 0.11, rh * 0.1, rw * 0.085, rh * 0.2);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = ['#d9a441', '#b6553f', '#5f8a5a', '#e6ddc7'][i % 4];
    ctx.globalAlpha = 0.55;
    ctx.fillRect(rw * 0.062 + i * rw * 0.026, rh * 0.1 + (i % 3) * 16, rw * 0.018, 10);
    ctx.globalAlpha = 1;
  }

  /* lamps */
  for (const lx of [rw * 0.3, rw * 0.7]) {
    ctx.strokeStyle = 'rgba(20,14,8,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, rh * 0.11); ctx.stroke();
    const glow = ctx.createRadialGradient(lx, rh * 0.16, 2, lx, rh * 0.16, 110);
    glow.addColorStop(0, 'rgba(255,214,140,.26)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(lx, rh * 0.16, 110, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3dcae';
    ctx.beginPath(); ctx.arc(lx, rh * 0.14, 5.5, 0, Math.PI * 2); ctx.fill();
  }

  /* stove (food shops) */
  if (fw) {
    const sx = rw * 0.2, sy = rh * 0.52;
    ctx.fillStyle = '#4c443a';
    rr(sx - 26, sy - 34, 52, 34, 5); ctx.fill();
    ctx.fillStyle = '#6d6559';
    rr(sx - 22, sy - 38, 44, 6, 3); ctx.fill();
    ctx.fillStyle = '#2a251f';
    ctx.beginPath(); ctx.ellipse(sx - 11, sy - 36, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 11, sy - 36, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    const cooking = sim.insideResidents(place).some(r => r.duty && r.duty.state === 'cook');
    if (cooking) {
      const fl = 0.55 + Math.sin(now / 110) * 0.45;
      for (const gx of [sx - 11, sx + 11]) {
        ctx.fillStyle = `rgba(255,140,54,${0.5 + fl * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(gx - 5, sy - 33);
        ctx.quadraticCurveTo(gx, sy - 44 - fl * 5, gx + 5, sy - 33);
        ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const ph = ((now / 1200 + i / 3) % 1);
        ctx.fillStyle = `rgba(240,235,220,${0.2 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(sx + Math.sin(ph * 6 + i) * 8, sy - 46 - ph * 30, 3 + ph * 7, 0, Math.PI * 2); ctx.fill();
      }
    }
    /* plates waiting */
    for (let i = 0; i < Math.min(4, Math.ceil(place.stock / 5)); i++) {
      ctx.fillStyle = '#f0e6d2';
      ctx.beginPath(); ctx.ellipse(sx + 34 + i * 12, sy - 6, 8, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,70,40,.4)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  const isHome = place.kind === 'home';

  /* counter */
  if (!isHome) {
  const cx = rw * 0.5, cy = rh * 0.56;
  ctx.fillStyle = 'rgba(30,20,10,.22)';
  rr(cx - 130, cy + 20, 260, 12, 6); ctx.fill();
  const cg = ctx.createLinearGradient(0, cy, 0, cy + 22);
  cg.addColorStop(0, '#b2834f');
  cg.addColorStop(1, '#7d5530');
  ctx.fillStyle = cg;
  rr(cx - 130, cy, 260, 22, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(50,32,16,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#cba06c';
  rr(cx - 130, cy, 260, 5, 3); ctx.fill();
  /* till + cups */
  ctx.fillStyle = '#55606a';
  rr(cx - 112, cy - 10, 26, 12, 3); ctx.fill();
  ctx.fillStyle = '#8fbf8a';
  ctx.fillRect(cx - 108, cy - 13, 18, 4);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#e8e2d4';
    rr(cx + 84 + i * 12, cy - 9, 8, 10, 2); ctx.fill();
  }

  }

  /* living room for homes */
  if (isHome) {
    /* rug */
    ctx.fillStyle = 'rgba(150,96,60,.32)';
    ctx.beginPath(); ctx.ellipse(rw * 0.5, rh * 0.7, 165, 44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,56,32,.35)'; ctx.lineWidth = 2; ctx.stroke();
    /* telly on a low unit */
    ctx.fillStyle = '#6b4a2a';
    rr(rw * 0.5 - 62, rh * 0.44, 124, 16, 4); ctx.fill();
    ctx.fillStyle = '#2c2a28';
    rr(rw * 0.5 - 46, rh * 0.3, 92, 58, 4); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,190,.35)';
    rr(rw * 0.5 - 41, rh * 0.3 + 4, 82, 48, 2); ctx.fill();
    /* sofa */
    ctx.fillStyle = 'rgba(30,20,10,.22)';
    ctx.beginPath(); ctx.ellipse(rw * 0.5, rh * 0.72, 96, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d4126';
    rr(rw * 0.5 - 88, rh * 0.62, 176, 30, 10); ctx.fill();
    ctx.fillStyle = '#7a5734';
    rr(rw * 0.5 - 88, rh * 0.58, 176, 16, 8); ctx.fill();
    ctx.fillStyle = '#9c7247';
    rr(rw * 0.5 - 84, rh * 0.605, 74, 22, 6); ctx.fill();
    rr(rw * 0.5 + 10, rh * 0.605, 74, 22, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(30,18,8,.45)'; ctx.lineWidth = 1.2;
    rr(rw * 0.5 - 88, rh * 0.58, 176, 34, 9); ctx.stroke();
    /* bed in the corner */
    ctx.fillStyle = 'rgba(30,20,10,.2)';
    rr(rw * 0.86 - 54, rh * 0.42 + 60, 108, 12, 5); ctx.fill();
    ctx.fillStyle = '#5d4126';
    rr(rw * 0.86 - 54, rh * 0.42 - 4, 108, 76, 7); ctx.fill();
    ctx.fillStyle = '#e8dfd0';
    rr(rw * 0.86 - 48, rh * 0.42 + 6, 96, 56, 5); ctx.fill();
    ctx.fillStyle = '#c96f5a';
    rr(rw * 0.86 - 48, rh * 0.42 + 34, 96, 28, 5); ctx.fill();
    ctx.fillStyle = '#f6efe3';
    rr(rw * 0.86 - 42, rh * 0.42 + 10, 40, 17, 5); ctx.fill();
    ctx.fillStyle = 'rgba(120,90,60,.28)';
    ctx.fillRect(rw * 0.86 - 42, rh * 0.42 + 40, 84, 2);
  }

  /* tables for eating */
  if (!isHome) for (const tx of [rw * 0.76, rw * 0.9]) {
    const ty = rh * 0.6;
    ctx.fillStyle = 'rgba(30,20,10,.2)';
    ctx.beginPath(); ctx.ellipse(tx, ty + 14, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5f38';
    ctx.beginPath(); ctx.ellipse(tx, ty, 32, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,12,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(tx - 3, ty, 6, 16);
    /* chairs */
    for (const off of [-30, 30]) {
      ctx.fillStyle = '#7b5738';
      rr(tx + off - 7, ty - 4, 14, 12, 3); ctx.fill();
      ctx.fillStyle = '#9b7048';
      rr(tx + off - 6, ty - 9, 12, 6, 2); ctx.fill();
    }
    /* plates */
    ctx.fillStyle = '#f0e6d2';
    ctx.beginPath(); ctx.ellipse(tx - 6, ty - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(tx + 8, ty + 2, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }

  /* fridge + plant + clock */
  ctx.fillStyle = '#c9d3d2';
  rr(rw * 0.2 - 34, rh * 0.24, 34, 56, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(60,80,80,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#9fb0ad';
  ctx.fillRect(rw * 0.2 - 32, rh * 0.24 + 24, 30, 2);
  ctx.fillStyle = '#6f8a5c';
  ctx.beginPath();
  ctx.ellipse(rw * 0.2 - 17, rh * 0.24 - 6, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8aa070';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(rw * 0.2 - 28 + i * 7, rh * 0.24 - 12 - (i % 2) * 4, 7, 3.4, i * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const clockX = rw * 0.62, clockY = rh * 0.16;
  ctx.fillStyle = '#f2e7ce';
  ctx.beginPath(); ctx.arc(clockX, clockY, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(clockX, clockY); ctx.lineTo(clockX, clockY - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(clockX, clockY); ctx.lineTo(clockX + 5, clockY + 3); ctx.stroke();

  /* door mat */
  ctx.fillStyle = 'rgba(229,174,77,.14)';
  rr(rw * 0.5 - 52, rh - 26, 104, 20, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(229,174,77,.4)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = 'rgba(244,228,196,.75)';
  ctx.font = '700 10px Cairo, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🚪 خروج', rw * 0.5, rh - 15);

  ctx.restore();   /* clip */

  /* ---- people ---- */
  const guests = sim.insideResidents(place);
  const S = 2.15;
  const drawn = [];
  for (const r of guests) {
    const slot = sim.interiorSlot(r, place);
    if (!slot) continue;
    drawn.push({ r, slot, y: slot.y });
  }
  drawn.sort((a, b) => a.y - b.y);
  for (const item of drawn) {
    const { r, slot } = item;
    const px = rw * slot.x;
    const py = rh * slot.y;
    if (slot.pose === 'sleep') {
      /* نايم في السرير */
      const zz = 0.6 + Math.sin(now / 520 + r.id) * 0.25;
      ctx.globalAlpha = zz;
      ctx.font = '700 13px Cairo, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💤', px, py - 16);
      ctx.globalAlpha = 1;
      ctx.font = '700 9.5px Cairo, sans-serif';
      ctx.fillStyle = 'rgba(12,9,6,.6)';
      const lw2 = ctx.measureText(r.name).width + 10;
      rr(px - lw2 / 2, py + 4, lw2, 13, 6); ctx.fill();
      ctx.fillStyle = '#d9cbb0';
      ctx.fillText(r.name, px, py + 10.5);
      continue;
    }
    ctx.save();
    ctx.scale(S, S);
    const ox = r.x, oy = r.y, od = r.dir, om = r.micro;
    r.x = px / S;
    r.y = py / S;
    r.micro = null;
    r.dir = slot.pose === 'queue' || slot.pose === 'order' || slot.pose === 'pay' ? -Math.PI / 2 : 0;
    drawAgent(r, now, 0);
    r.x = ox; r.y = oy; r.dir = od; r.micro = om;
    ctx.restore();

    /* label (staggered so two people at one table don't hide each other's name) */
    const ly = py + 6 + (slot.pose === 'eat' ? (drawn.indexOf(item) % 2) * 12 : 0);
    ctx.font = '700 10.5px Cairo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(12,9,6,.72)';
    const lw = ctx.measureText(r.name).width + 12;
    rr(px - lw / 2, ly, lw, 15, 7); ctx.fill();
    ctx.fillStyle = r.id === selectedId ? '#f4d089' : '#efe1c6';
    ctx.fillText(r.name, px, ly + 2);
  }

  /* ---- HUD inside the room (bottom-left) ---- */
  ctx.fillStyle = 'rgba(16,12,8,.78)';
  rr(18, rh - 66, 300, 52, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(229,174,77,.22)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = '700 11.5px Cairo, sans-serif';
  if (place.kind === 'home') {
    ctx.fillStyle = '#e2b466';
    ctx.fillText('🏠 بيت', 306, rh - 50);
  } else {
    ctx.fillStyle = status.open ? '#9fd0a6' : '#e8a08c';
    ctx.fillText(status.open ? '● مفتوح' : '● ' + status.label, 306, rh - 50);
  }
  if (fw) {
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    rr(150, rh - 43, 156, 7, 4); ctx.fill();
    ctx.fillStyle = '#e2b466';
    rr(150, rh - 43, 156 * clamp(place.stock / (place.stockMax || 1), 0, 1), 7, 4); ctx.fill();
    ctx.fillStyle = '#e6d4b0';
    ctx.font = '600 9.6px Cairo, sans-serif';
    ctx.fillText(`مخزون ${ar(place.stock)} • طابور ${ar(place.queue.length)} • بيع ${ar(place.salesToday || 0)}`, 306, rh - 28);
  } else if (place.kind === 'home') {
    const tenants = sim.residents.filter(r => r.homeId === place.id);
    ctx.fillStyle = '#e6d4b0';
    ctx.font = '600 9.8px Cairo, sans-serif';
    ctx.fillText(`ساكنين ${ar(tenants.length)} • شقق ${ar(place.flats || 0)} • إيجار ${money(place.rent || 0)}`, 306, rh - 30);
  }
  ctx.restore();  /* translate */

  /* enter fade */
  if (insideT < 1) {
    ctx.fillStyle = `rgba(10,7,4,${1 - insideT})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawPlace(p, now, night) {
  const { x, y, w, h } = p;
  let k = 1;
  if (p.appear) k = clamp((now - p.appear) / 620, 0, 1);
  if (k <= 0) return;
  const ease = 1 - Math.pow(1 - k, 3);

  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.6);
  if (k < 1) {
    const cx = x + w / 2, cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(0.72 + 0.28 * ease, 0.86 + 0.14 * ease);
    ctx.translate(-cx, -cy);
  }

  if (p.style === 'pitch') {
    drawPitch(p, now);
    ctx.restore();
    return;
  }
  if (p.style === 'lot') {
    drawLot(p, now, night);
    ctx.restore();
    return;
  }

  /* shadow */
  ctx.fillStyle = 'rgba(84,60,32,.20)';
  rr(x + 7, y + 9, w, h, 8); ctx.fill();

  /* body */
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(p.color, 0.16));
  g.addColorStop(0.55, p.color);
  g.addColorStop(1, shade(p.color, -0.16));
  ctx.fillStyle = g;
  rr(x, y, w, h, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(70,50,28,.42)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  /* parapet */
  ctx.fillStyle = shade(p.color, -0.24);
  rr(x + 1, y + 1, w - 2, 9, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(x + 8, y + 1, w - 16, 1.4);

  drawWindows(p, night > 0.18 && !sim.powerCut);
  drawDoor(p);
  drawAwningForStyle(p);
  drawSign(p);
  drawPlaceExtras(p, now, night);
  ctx.restore();
}

function drawAwningForStyle(p) {
  const { x, y, w, h } = p;
  const dx = p.door.x;
  if (p.style === 'shop' && !['kiosk'].includes(p.style)) {
    drawAwning(dx, y + h - 38, 62, '#bf5540');
  } else if (p.style === 'kiosk') {
    drawAwning(dx, y + h - 36, 46, '#3f8a7c');
  }
}

function drawPitch(p, now) {
  const { x, y, w, h } = p;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#93ab7d');
  g.addColorStop(1, '#7e9868');
  ctx.fillStyle = g;
  rr(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,30,.35)'; ctx.lineWidth = 1.4; ctx.stroke();

  /* mowed stripes */
  ctx.save();
  rr(x, y, w, h, 8); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x + i * (w / 6), y, w / 12, h);
  ctx.restore();

  /* lines */
  ctx.strokeStyle = 'rgba(248,244,230,.6)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 10); ctx.lineTo(x + w / 2, y + h - 10);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 17, 0, Math.PI * 2); ctx.stroke();

  /* goals */
  ctx.strokeStyle = 'rgba(250,248,238,.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 10, y + h / 2 - 12, 7, 24);
  ctx.strokeRect(x + w - 17, y + h / 2 - 12, 7, 24);
}

/* ------------------------------------------------------------
   drawing: residents
   ------------------------------------------------------------ */
function drawOwnedCar(x, y, dir, car, night, parked) {
  ctx.save();
  if (parked) ctx.globalAlpha = 1;
  drawCar(x, y, dir, car.color || '#d8d2c2', night, { plain: true });
  /* نمرة العربية */
  if (parked) {
    ctx.fillStyle = 'rgba(20,16,12,.55)';
    rr(x - 11, y + 9, 22, 6, 2); ctx.fill();
    ctx.fillStyle = '#f2e6c8';
    ctx.font = '600 4.6px Cairo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(car.plate || '', x, y + 12);
  }
  ctx.restore();
}

/* كورة: جونين + كورة بتتنطط */
function drawMatch(m, now, night) {
  const a = m.area;
  const cy = a.y + a.h / 2;
  const t = now / 1000;
  ctx.save();
  /* أرضية الشارع/الملعب */
  if (m.street) {
    ctx.fillStyle = 'rgba(255,240,200,.10)';
    rr(a.x, a.y, a.w, a.h, 8); ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,246,220,.5)';
    ctx.lineWidth = 1.4;
    rr(a.x, a.y, a.w, a.h, 8); ctx.stroke();
    ctx.setLineDash([]);
    /* حواجز بسيطة (طوب/شنط) عشان العربيات تفهم */
    for (const bx of [a.x - 6, a.x + a.w + 6]) {
      ctx.fillStyle = '#b98b52';
      rr(bx - 3, a.y + 4, 6, a.h - 8, 2); ctx.fill();
    }
  }
  /* جونين */
  for (const side of [-1, 1]) {
    const gx = side < 0 ? a.x + 4 : a.x + a.w - 4;
    ctx.strokeStyle = 'rgba(250,246,232,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, cy - 13); ctx.lineTo(gx, cy + 13);
    ctx.moveTo(gx, cy - 13); ctx.lineTo(gx - side * 7, cy - 13);
    ctx.moveTo(gx, cy + 13); ctx.lineTo(gx - side * 7, cy + 13);
    ctx.stroke();
  }
  /* الكورة */
  const bx = m.ball.x, by = m.ball.y - Math.abs(Math.sin(t * 6)) * 2.2;
  ctx.fillStyle = 'rgba(30,24,16,.28)';
  ctx.beginPath(); ctx.ellipse(m.ball.x, m.ball.y + 3, 3.4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6f2e6';
  ctx.beginPath(); ctx.arc(bx, by, 3.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(60,50,30,.5)'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.fillStyle = '#33302a';
  ctx.beginPath(); ctx.arc(bx - 0.8, by - 0.8, 1, 0, Math.PI * 2); ctx.fill();
  /* النتيجة */
  ctx.font = '700 7px Cairo, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(20,14,8,.62)';
  const label = `${ar(m.scoreA)} – ${ar(m.scoreB)}`;
  const w = ctx.measureText(label).width + 10;
  rr(a.x + a.w / 2 - w / 2, a.y - 13, w, 11, 5); ctx.fill();
  ctx.fillStyle = '#f4e6c4';
  ctx.fillText(label, a.x + a.w / 2, a.y - 3);
  ctx.restore();
}

/* شرطة: إشارة فوق الظابط + مكان الجريمة */
function drawSafety(now, night) {
  const t = now / 1000;
  for (const o of sim.residents) {
    if (!o.onDuty || o.indoors) continue;
    const investigating = o.task && o.task.kind === 'investigate';
    const blink = Math.sin(t * (investigating ? 12 : 4)) > 0;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = blink ? '#4b8ed6' : '#d44a3a';
    ctx.beginPath(); ctx.arc(o.x, o.y - 34, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = blink ? 'rgba(75,142,214,.22)' : 'rgba(212,74,58,.22)';
    ctx.beginPath(); ctx.arc(o.x, o.y - 34, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const fresh = (sim.incidents || []).filter(i => sim.minute - i.at < 150 && i.x);
  for (const inc of fresh.slice(-2)) {
    const k = (Math.sin(t * 3.4) + 1) / 2;
    ctx.save();
    /* دايرة بوليس بضوء أحمر/أزرق بينور */
    ctx.globalAlpha = 0.5 + k * 0.45;
    ctx.fillStyle = inc.solved ? '#3f6fb0' : '#d44a3a';
    ctx.beginPath(); ctx.arc(inc.x, inc.y - 28 - k * 3, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.28 + k * 0.22;
    ctx.strokeStyle = inc.solved ? '#3f6fb0' : '#d44a3a';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(inc.x, inc.y - 28 - k * 3, 8 + k * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function agentFade(r) {
  if (!r.anim) return 1;
  const pr = clamp(r.anim.t / 1.15, 0, 1);
  if (r.anim.dir === 'in') return clamp(1 - (pr - 0.22) / 0.28, 0, 1);
  return clamp((pr - 0.36) / 0.26, 0, 1);
}

function drawAgent(r, now, night) {
  const t = now / 1000;
  const dim = clamp((night || 0) * 0.5, 0, 0.3);
  const look = r.look || {
    height: 1, build: 1, top: r.color, pants: '#39434f', galabeya: false,
    hijab: r.gender === 'f', hijabColor: '#e8dcc8', hair: r.hair,
    hairStyle: 'short', beard: false, moustache: false, glasses: false,
    bag: null, apron: null, shoe: '#3a2f26', skinTone: r.skin,
  };
  const walking = r.phase === 'walk';
  const ph = t * 8.2 + r.id * 1.7;
  const swing = walking ? Math.sin(ph) : 0;
  const bob = walking ? Math.abs(Math.sin(ph)) * 1.1 : Math.sin(t * 1.6 + r.id) * 0.32;
  const working = !!(r.task && r.task.kind === 'work' && r.phase === 'act');
  const seated = !!(r.task && ['social', 'family', 'eat'].includes(r.task.kind) && r.phase === 'act');

  const spawnK = r.spawnAt ? clamp((now - r.spawnAt) / 500, 0, 1) : 1;
  if (spawnK <= 0) return;
  const sc = 0.55 + 0.45 * (1 - Math.pow(1 - spawnK, 2));
  const faceLeft = Math.cos(r.dir || 0) < -0.15 ? -1 : 1;

  const H = look.height, B = look.build;
  const legLen = 9 * H;
  const torsoLen = 11.6 * H;
  const hipY = -legLen;
  const shoulderY = hipY - torsoLen;
  const headR = 4.4 * (0.95 + 0.05 * H);
  const headY = shoulderY - headR - 0.4;
  const skin = shade(look.skinTone || r.skin, -dim * 0.85);

  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(sc * 1.18 * faceLeft, sc * 1.18 * (seated ? 0.93 : 1));

  /* shadow */
  ctx.fillStyle = 'rgba(68,48,24,.24)';
  ctx.beginPath(); ctx.ellipse(0, 1.5, 7.4, 3.2, 0, 0, Math.PI * 2); ctx.fill();

  if (r.id === selectedId) {
    ctx.strokeStyle = 'rgba(240,196,102,.9)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(0, 1.5, 11.5, 5.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  } else if (r.id === hoverId) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 1.5, 10.4, 4.8, 0, 0, Math.PI * 2); ctx.stroke();
  }

  const baseY = -bob;
  const longRobe = look.galabeya || r.gender === 'f';
  const legColor = shade(look.pants, -dim);
  const top = shade(look.top, 0.1 - dim);
  const topDark = shade(look.top, -0.16 - dim);

  /* ---- shoes / legs ---- */
  if (longRobe) {
    /* robe skirt covers the legs; only shoes peep out */
    ctx.strokeStyle = shade(look.shoe, -dim);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.2, baseY - 2.4);
    ctx.lineTo(-2.2 + swing * 1.6, baseY - 0.7);
    ctx.moveTo(2.2, baseY - 2.4);
    ctx.lineTo(2.2 - swing * 1.6, baseY - 0.7);
    ctx.stroke();
  } else {
    ctx.strokeStyle = legColor;
    ctx.lineWidth = 2.3 * B;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.1, hipY);
    ctx.lineTo(-2.1 + swing * 2.4, baseY - 1.2);
    ctx.moveTo(2.1, hipY);
    ctx.lineTo(2.1 - swing * 2.4, baseY - 1.2);
    ctx.stroke();
    /* shoes */
    ctx.strokeStyle = shade(look.shoe, -dim);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-2.1 + swing * 2.4, baseY - 1);
    ctx.lineTo(-1.4 + swing * 2.4, baseY - 0.6);
    ctx.moveTo(2.1 - swing * 2.4, baseY - 1);
    ctx.lineTo(1.4 - swing * 2.4, baseY - 0.6);
    ctx.stroke();
  }

  /* ---- torso ---- */
  const sw = 4.9 * B;
  const bg = ctx.createLinearGradient(0, shoulderY, 0, hipY + 2);
  bg.addColorStop(0, top);
  bg.addColorStop(1, topDark);
  ctx.fillStyle = bg;
  if (longRobe) {
    /* galabeya / abaya: narrow shoulders, wide hem */
    ctx.beginPath();
    ctx.moveTo(-sw + 0.5, shoulderY + 1);
    ctx.quadraticCurveTo(0, shoulderY - 1.4, sw - 0.5, shoulderY + 1);
    ctx.lineTo(sw + 1.6, baseY - 3);
    ctx.quadraticCurveTo(0, baseY - 1.2, -sw - 1.6, baseY - 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,32,18,.32)';
    ctx.lineWidth = 0.8; ctx.stroke();
    /* collar */
    ctx.strokeStyle = shade(look.top, -0.3);
    ctx.beginPath();
    ctx.moveTo(-2.2, shoulderY + 1.2);
    ctx.lineTo(0, shoulderY + 4.2);
    ctx.lineTo(2.2, shoulderY + 1.2);
    ctx.stroke();
  } else {
    rr(-sw, shoulderY, sw * 2, torsoLen + 1.2, 3.4 * B); ctx.fill();
    ctx.strokeStyle = 'rgba(45,32,18,.34)';
    ctx.lineWidth = 0.8; ctx.stroke();
    /* collar + buttons */
    ctx.strokeStyle = shade(look.top, -0.34);
    ctx.beginPath();
    ctx.moveTo(-1.9, shoulderY + 0.6);
    ctx.lineTo(0, shoulderY + 3.4);
    ctx.lineTo(1.9, shoulderY + 0.6);
    ctx.stroke();
  }

  /* apron for the people behind a counter */
  if (look.apron) {
    ctx.fillStyle = shade(look.apron, -dim * 0.6);
    ctx.beginPath();
    ctx.moveTo(-sw + 0.6, shoulderY + torsoLen * 0.32);
    ctx.lineTo(sw - 0.6, shoulderY + torsoLen * 0.32);
    ctx.lineTo(sw + 0.2, hipY + 2.6);
    ctx.lineTo(-sw - 0.2, hipY + 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,54,34,.28)'; ctx.lineWidth = 0.7; ctx.stroke();
  }

  /* ---- arms ---- */
  const sleeve = longRobe ? topDark : shade(look.top, -0.2 - dim);
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 1.9 * B;
  ctx.lineCap = 'round';
  const shoulderX = sw - 0.4;
  let handL, handR;
  if (working) {
    /* hands out over the counter, tiny busy motion */
    const k = Math.sin(t * 4.2 + r.id) * 0.9;
    handL = [-shoulderX - 2.4 + k, shoulderY + 6.4];
    handR = [shoulderX + 2.6 - k, shoulderY + 5.4];
  } else if (seated) {
    handL = [-shoulderX - 1.2, shoulderY + 6.8];
    handR = [shoulderX + 1.2, shoulderY + 6.8];
  } else {
    handL = [-shoulderX - 1.1 - swing * 1.5, hipY + 1.4];
    handR = [shoulderX + 1.1 + swing * 1.5, hipY + 1.4];
  }
  ctx.beginPath();
  ctx.moveTo(-shoulderX, shoulderY + 1.4); ctx.lineTo(handL[0], handL[1]);
  ctx.moveTo(shoulderX, shoulderY + 1.4); ctx.lineTo(handR[0], handR[1]);
  ctx.stroke();
  /* hands */
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(handL[0], handL[1], 1.05, 0, Math.PI * 2);
  ctx.arc(handR[0], handR[1], 1.05, 0, Math.PI * 2);
  ctx.fill();

  /* ---- head ---- */
  const hx = 0;
  const hy = headY;
  const hairC = shade(look.hair, -dim);

  if (r.gender === 'f' && !look.hijab) {
    /* long hair behind the face */
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 1.6, headR + 1.3, headR + 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.fill();

  /* ears */
  ctx.beginPath();
  ctx.arc(hx - headR, hy + 0.5, 0.85, 0, Math.PI * 2);
  ctx.arc(hx + headR, hy + 0.5, 0.85, 0, Math.PI * 2);
  ctx.fill();

  if (look.hijab) {
    ctx.fillStyle = shade(look.hijabColor, -dim * 0.7);
    ctx.beginPath();
    ctx.ellipse(hx, hy + 0.2, headR + 1.15, headR + 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    /* drape over the shoulders */
    ctx.beginPath();
    ctx.moveTo(hx - headR - 0.6, hy + 1.6);
    ctx.quadraticCurveTo(hx - headR - 2.2, hy + headR + 5, hx - 1.4, shoulderY + 4.4);
    ctx.lineTo(hx + 1.4, shoulderY + 4.4);
    ctx.quadraticCurveTo(hx + headR + 2.2, hy + headR + 5, hx + headR + 0.6, hy + 1.6);
    ctx.closePath();
    ctx.fill();
    /* face opening */
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 0.7, headR - 0.7, headR - 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    /* stitched edge */
    ctx.strokeStyle = shade(look.hijabColor, -0.32);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 0.2, headR + 1.15, headR + 1.5, 0, Math.PI * 0.92, Math.PI * 2.08);
    ctx.stroke();
  } else if (r.gender === 'm') {
    if (look.hairStyle === 'bald') {
      /* nothing on top */
    } else if (look.hairStyle === 'taqiyah') {
      ctx.fillStyle = '#f2ecdd';
      ctx.beginPath();
      ctx.arc(hx, hy - 0.5, headR - 0.4, Math.PI * 1.02, Math.PI * 2.02);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,126,102,.6)'; ctx.lineWidth = 0.6; ctx.stroke();
    } else if (look.hairStyle === 'cap') {
      ctx.fillStyle = shade('#2f4a6a', -dim);
      ctx.beginPath();
      ctx.arc(hx, hy - 0.3, headR + 0.4, Math.PI * 1.04, Math.PI * 2.02);
      ctx.fill();
      ctx.fillStyle = shade('#24384f', -dim);
      ctx.beginPath();
      ctx.ellipse(hx + faceLeft * 1.4, hy - 0.1, headR + 2.2, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.arc(hx, hy - 0.7, headR + 0.15, Math.PI * 1.03, Math.PI * 2.0);
      ctx.fill();
    }
  } else {
    /* short bob without hijab */
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.5, headR + 0.5, Math.PI * 1.0, Math.PI * 2.03);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx - headR - 0.2, hy + 1.4, 1.1, headR, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + headR + 0.2, hy + 1.4, 1.1, headR, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- face ---- */
  const eyeY = hy + 0.2;
  ctx.fillStyle = 'rgba(42,30,20,.82)';
  if (look.glasses) {
    ctx.strokeStyle = 'rgba(46,40,34,.75)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.arc(hx - 1.55, eyeY, 1.25, 0, Math.PI * 2);
    ctx.arc(hx + 1.55, eyeY, 1.25, 0, Math.PI * 2);
    ctx.moveTo(hx - 0.3, eyeY);
    ctx.lineTo(hx + 0.3, eyeY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(hx - 1.5, eyeY, 0.56, 0, Math.PI * 2);
  ctx.arc(hx + 1.5, eyeY, 0.56, 0, Math.PI * 2);
  ctx.fill();
  /* brows */
  ctx.strokeStyle = 'rgba(52,38,24,.5)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(hx - 2.2, eyeY - 1.1); ctx.lineTo(hx - 0.9, eyeY - 1.3);
  ctx.moveTo(hx + 0.9, eyeY - 1.3); ctx.lineTo(hx + 2.2, eyeY - 1.1);
  ctx.stroke();
  /* mouth */
  ctx.strokeStyle = 'rgba(120,62,48,.72)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  if (r.mood > 66) ctx.arc(hx, hy + 1.7, 1.2, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (r.mood < 34) ctx.arc(hx, hy + 2.8, 1.2, 1.2 * Math.PI, 1.8 * Math.PI);
  else { ctx.moveTo(hx - 1, hy + 2.2); ctx.lineTo(hx + 1, hy + 2.2); }
  ctx.stroke();

  if (look.moustache) {
    ctx.strokeStyle = shade(look.hair, -0.1);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx - 1.5, hy + 1.5); ctx.quadraticCurveTo(hx, hy + 1.1, hx + 1.5, hy + 1.5);
    ctx.stroke();
  }
  if (look.beard) {
    ctx.fillStyle = 'rgba(52,38,26,.55)';
    ctx.beginPath();
    ctx.arc(hx, hy + 0.9, headR - 0.55, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.fill();
  }

  /* ---- carried thing ---- */
  if (r.carry) {
    ctx.font = '7px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.carry, handR[0] + 1.6, handR[1] + 1.6);
  } else if (look.bag) {
    ctx.fillStyle = shade(look.bag, -dim);
    rr(handR[0] - 1.4, handR[1] + 0.2, 3.2, 3.4, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,14,.4)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(handR[0] - 0.6, handR[1] + 0.4);
    ctx.lineTo(handR[0] - 0.6, handR[1] - 0.6);
    ctx.lineTo(handR[0] + 0.9, handR[1] - 0.6);
    ctx.stroke();
  }

  ctx.restore();
}

function measureBubble(text) {
  const maxW = 132;
  const font = '600 9.8px Cairo, sans-serif';
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2] + '…'; }
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const bw = Math.min(maxW + 16, w + 16);
  const bh = lines.length * 14 + 9;
  return { lines, w: bw, h: bh, font };
}

function paintBubble(layout, cx, by, theme) {
  const bw = layout.w, bh = layout.h;
  const bx = cx - bw / 2;
  const talk = theme === 'talk';
  const fill = talk ? 'rgba(232,247,241,.98)' : 'rgba(251,244,226,.97)';
  const edge = talk ? 'rgba(31,92,84,.9)' : 'rgba(59,46,33,.85)';

  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  rr(bx, by, bw, bh, 8);
  ctx.fill(); ctx.stroke();
  /* tail */
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh - 0.6);
  ctx.lineTo(cx + 4, by + bh - 0.6);
  ctx.lineTo(cx, by + bh + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx + 4, by + bh);
  ctx.stroke();

  ctx.fillStyle = talk ? '#1f443f' : '#3b2e21';
  ctx.font = layout.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  layout.lines.forEach((l, i) => ctx.fillText(l, cx, by + 5 + i * 14));
}

function drawBubbles(now) {
  let shown = 0, talks = 0;
  const placed = [];
  const hits = (a) => placed.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);

  for (const r of sim.residents) {
    if (r.speech && r.speech !== r._seenSpeech) {
      r._seenSpeech = r.speech;
      r._speechAt = now;
    }
    const isSel = r.id === selectedId;
    const isHover = r.id === hoverId;
    const force = isSel || isHover;

    let text = '';
    let theme = 'thought';
    if (r.speech && now - (r._speechAt || 0) < 3800 && (showBubbles || force) && talks < 3) {
      text = r.speech;
      theme = 'talk';
    } else if (r.thought) {
      if (r._lastThought !== r.thought) {
        r._lastThought = r.thought;
        r._bubbleAt = now;
      }
      const fresh = now - (r._bubbleAt || 0) < 4600;
      if (force || (showBubbles && fresh && shown < 3)) text = r.thought;
    }
    if (!text) continue;

    const layout = measureBubble(text);
    const cx = clamp(r.x, layout.w / 2 + 8, WORLD.w - layout.w / 2 - 8);
    let by = r.y - 44 - layout.h;
    let box = { x: cx - layout.w / 2, y: by, w: layout.w, h: layout.h };
    let tries = 0;
    while (hits(box) && tries < 5) { by -= layout.h + 6; box = { x: box.x, y: by, w: box.w, h: box.h }; tries++; }
    if (tries >= 5 && hits(box) && !force) continue;
    if (by < 4) by = 4;
    box.y = by;
    placed.push(box);
    paintBubble(layout, cx, by, theme);
    if (theme === 'talk') talks++; else shown++;
  }
}

function drawCounter(p, now, night) {
  const x = p.door.x;
  const y = p.door.y + 8;
  const dim = clamp((night || 0) * 0.45, 0, 0.3);
  const staff = sim.workerAt(p.id);
  const waiting = sim.residents.some(r => r !== staff && r.task && ['shop', 'eat'].includes(r.task.kind) && r.task.placeId === p.id);
  if (!staff && !waiting) return;

  ctx.save();
  ctx.fillStyle = 'rgba(58,38,20,.22)';
  rr(x - 20, y + 5, 40, 4, 2); ctx.fill();

  /* thin wooden counter */
  const g = ctx.createLinearGradient(0, y, 0, y + 6);
  g.addColorStop(0, shade('#b2834f', 0.12 - dim));
  g.addColorStop(1, shade('#7d5530', -dim));
  ctx.fillStyle = g;
  rr(x - 19, y, 38, 6.5, 2.2); ctx.fill();
  ctx.strokeStyle = 'rgba(52,34,18,.5)';
  ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = shade('#cba06c', 0.08 - dim);
  rr(x - 19, y, 38, 1.7, 1.4); ctx.fill();

  /* goods */
  const goods = ['#d9a441', '#b6553f', '#5f8a5a', '#e6ddc7'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = shade(goods[i], -dim);
    ctx.beginPath();
    ctx.arc(x - 12 + i * 8, y - 1.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.arc(x - 12.5 + i * 8, y - 2, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  /* tiny price tag on a stick */
  ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x + 20, y + 4); ctx.lineTo(x + 20, y - 7); ctx.stroke();
  ctx.fillStyle = 'rgba(247,239,222,.95)';
  rr(x + 15, y - 12, 11, 6, 1.6); ctx.fill();
  ctx.strokeStyle = 'rgba(70,50,30,.5)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = '#8a5a12';
  ctx.font = '700 3.8px Cairo, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('سعر', x + 20.5, y - 9);

  /* serving shimmer */
  if (staff) {
    const pulse = 0.5 + Math.sin(now / 380) * 0.5;
    ctx.fillStyle = `rgba(255,206,120,${0.06 + pulse * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const fxList = [];
sim.onFx = ev => {
  fxList.push(Object.assign({ t0: performance.now() }, ev));
  if (fxList.length > 40) fxList.shift();
};

function drawFx(now) {
  if (!sim.started) return;
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    const age = (now - f.t0) / 1000;
    if (age > 2.4) { fxList.splice(i, 1); continue; }
    const rise = age * 13;
    const alpha = age < 0.15 ? age / 0.15 : 1 - Math.max(0, (age - 1.1) / 1.3);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (f.type === 'sale') {
      const text = String(f.text);
      ctx.font = '800 10.5px Cairo, sans-serif';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(255,247,226,.9)';
      ctx.strokeText(text, f.x, f.y - rise);
      ctx.fillStyle = '#8a5a12';
      ctx.fillText(text, f.x, f.y - rise);
    } else if (f.type === 'talk') {
      ctx.font = '9px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText('💬', f.x, f.y - rise);
    } else if (f.type === 'queue') {
      ctx.strokeStyle = 'rgba(60,42,24,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y + 2, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawNameTag(r) {
  const font = '700 10px Cairo, sans-serif';
  ctx.font = font;
  const w = ctx.measureText(r.name).width + 14;
  const x = r.x - w / 2, y = r.y + 7;
  ctx.fillStyle = r.id === selectedId ? 'rgba(244,208,137,.96)' : 'rgba(28,22,15,.82)';
  rr(x, y, w, 16, 8); ctx.fill();
  ctx.fillStyle = r.id === selectedId ? '#2a1d0c' : '#f4e6c8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(r.name, r.x, y + 8.5);
}

/* ------------------------------------------------------------
   main draw
   ------------------------------------------------------------ */
function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#cbb287';
  ctx.fillRect(0, 0, VW, VH);
  if (!sim.started) { drawBlueprint(now); return; }
  if (insideId) { drawInterior(now); return; }

  worldTransform();
  const night = darkness(sim.minute);
  drawGround(now);
  drawRoads(now);
  drawStreetLife(now / 1000, night);

  const sorted = sim.places.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const p of sorted) {
    drawPlace(p, now, night);
    if (p.counter) drawShopProps(p, now, night);
  }

  for (const L of LAMPS) drawLamp(L.x, L.y, now / 1000, night);
  PALMS.forEach((pl, i) => drawPalm(pl.x, pl.y, now / 1000, i));

  /* night tint */
  if (night > 0.01) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(9,16,38,${night})`;
    ctx.fillRect(0, 0, VW, VH);

    worldTransform();
    ctx.globalCompositeOperation = 'lighter';
    if (!sim.powerCut) {
      for (const L of LAMPS) {
        const g = ctx.createRadialGradient(L.x + 10, L.y - 30, 2, L.x + 10, L.y - 30, 78);
        g.addColorStop(0, 'rgba(255,196,110,.26)');
        g.addColorStop(1, 'rgba(255,196,110,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(L.x + 10, L.y - 30, 78, 0, Math.PI * 2); ctx.fill();
      }
      for (const p of sim.places) {
        if (p.style === 'pitch') continue;
        const g = ctx.createRadialGradient(p.door.x, p.door.y, 2, p.door.x, p.door.y, 55);
        g.addColorStop(0, 'rgba(255,206,128,.13)');
        g.addColorStop(1, 'rgba(255,206,128,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.door.x, p.door.y, 55, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* people stay readable above the night tint — counters sit in the same depth queue */
  worldTransform();
  computeDoors();
  const renderQueue = [];
  for (const r of sim.residents) {
    if (r.indoors) continue;
    const fade = agentFade(r);
    if (fade <= 0.02) continue;
    renderQueue.push({ y: r.y, draw: () => {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * fade;
      drawAgent(r, now, night);
      ctx.globalAlpha = a0;
    } });
  }
  for (const p of sim.places) {
    if (p.counter) renderQueue.push({ y: p.door.y + 12, draw: () => drawCounter(p, now, night) });
  }
  /* عربيات الحارة: اللي راكنة قصاد البيوت واللي ماشية في مشوار */
  for (const car of sim.cars) {
    const owner = car.ownerId ? sim.getResident(car.ownerId) : null;
    const driver = car.driverId ? sim.getResident(car.driverId) : null;
    const moving = [owner, driver].find(p => p && !p.indoors && p.task && p.task.kind === 'ride');
    if (moving) {
      renderQueue.push({ y: moving.y + 1, draw: () => drawOwnedCar(moving.x, moving.y, Math.cos(moving.dir || 0) < 0 ? -1 : 1, car, night) });
    } else if (car.parkAt) {
      renderQueue.push({ y: car.parkAt.y - 2, draw: () => drawOwnedCar(car.parkAt.x, car.parkAt.y, 1, car, night, true) });
    }
  }

  renderQueue.sort((a, b) => a.y - b.y).forEach(item => item.draw());
  for (const m of sim.matches) drawMatch(m, now, night);
  drawSafety(now, night);
  drawStateChips(now);
  drawFx(now);

  /* bubbles + labels on top of everything */
  const sel = sim.getResident(selectedId);
  const hov = sim.getResident(hoverId);
  drawBubbles(now);
  if (hov) drawNameTag(hov);
  if (sel) drawNameTag(sel);
}

/* ------------------------------------------------------------
   interface
   ------------------------------------------------------------ */
const logList = $('logList');
const peopleList = $('peopleList');
const toastEl = $('toast');
let uiLogs = [];
let filter = 'all';
let logRows = 0;
let toastTimer = 0;

const FILTERS = {
  all: () => true,
  think: e => e.kind === 'think',
  money: e => e.kind === 'money',
  work: e => e.kind === 'work',
  life: e => ['social', 'food', 'home'].includes(e.kind),
  talk: e => e.kind === 'talk',
  love: e => e.kind === 'love',
  build: e => e.kind === 'build',
  event: e => ['event', 'system'].includes(e.kind),
  crime: e => ['crime', 'police'].includes(e.kind),
  street: e => ['ride', 'match'].includes(e.kind),
};

function logRow(e, fresh) {
  const kind = KINDS[e.kind] || KINDS.system;
  const row = document.createElement('div');
  row.className = 'log-row' + (fresh ? ' fresh' : '');
  row.dataset.kind = e.kind;
  row.style.setProperty('--who', e.color || kind.color);
  if (e.rid) row.dataset.rid = e.rid;
  row.innerHTML =
    `<span class="lt"><i>يوم ${ar(e.day)}</i><b>${timeLabel(e.time)}</b></span>` +
    `<span class="li" title="${kind.label}">${kind.icon}</span>` +
    `<div class="lx">${e.name ? `<b>${esc(e.name)}</b> ` : ''}${esc(e.text)}</div>`;
  return row;
}

function addLogRow(e) {
  const empty = logList.querySelector('.log-empty');
  if (empty) empty.remove();
  const atTop = logList.scrollTop <= 6;
  const row = logRow(e, true);
  logList.prepend(row);
  if (!atTop && row.offsetHeight) logList.scrollTop += row.offsetHeight;
  logRows++;
  while (logRows > 260 && logList.lastElementChild) {
    logList.removeChild(logList.lastElementChild);
    logRows--;
  }
}

function rebuildLogs() {
  logList.innerHTML = '';
  logRows = 0;
  const rows = uiLogs.filter(FILTERS[filter]).slice(-200).reverse();
  if (!rows.length) {
    logList.innerHTML = '<div class="log-empty">مفيش حاجة هنا لسه…<br>سيب الحارة تعيش شوية.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const e of rows) frag.appendChild(logRow(e, false));
  logList.appendChild(frag);
  logRows = rows.length;
}

sim.onLog = entry => {
  uiLogs.push(entry);
  if (uiLogs.length > 900) uiLogs.shift();
  if (FILTERS[filter](entry)) addLogRow(entry);
};

sim.onToast = text => {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
};

function select(id) {
  selectedId = id;
  const card = $('card');
  const r = sim.getResident(id);
  if (!r) { card.hidden = true; return; }
  if (placeId) { placeId = null; $('placeCard').hidden = true; }
  card.hidden = false;
  updateCard();
  renderPeople(true);
  $('hint').classList.add('gone');
}

function homeName(r) {
  const p = sim.getPlace(r.homeId);
  return p ? p.name : '—';
}

const TASK_LABEL = {
  work: 'شغال',
  sleep: 'نايم',
  eat: 'بياكل',
  bills: 'بيدفع الفاتورة',
  rent: 'بيدفع الإيجار',
  gig: 'شغل يومية',
  social: 'قاعد مع الناس',
  jobSearch: 'بيدور على شغل',
  family: 'قاعد مع عياله',
  shop: 'بيشتري حاجة',
  buy: 'بياكل في المحل',
  build: 'بيشتغل في البناء',
  school: 'في المدرسة',
  play: 'بيلعب',
  wander: 'بيتمشى',
  football: 'بيلعب كورة',
  robbery: 'بيدور يسرق',
  investigate: 'بيحقّق في بلاغ',
  patrol: 'في دورية',
  ride: 'سواق تاكسي',
  hail: 'مستني عربية',
  jail: 'في الحبس',
};

function actionText(r) {
  if (r.indoors && !r.anim && r.task && r.task.kind === 'sleep') return 'نايم جوه البيت 💤';
  if (r.anim) return r.anim.dir === 'in' ? 'بيدخل البيت… 🚪' : 'بيطلع من البيت… 🚪';
  if (r.task && r.task.kind === 'ride' && r.task.stage === 'riding') return 'راكب عربية في مشوار 🚕';
  if (!r.task) return r.phase === 'walk' ? 'ماشي في الشارع' : 'واقف بيفكر في حاله';
  const place = sim.getPlace(r.task.placeId);
  if (r.task.kind === 'buy' && r.phase === 'act') {
    const st = r.task.stage;
    const where = place ? ' في ' + place.name : '';
    if (st === 'queue') return 'واقف في الطابور' + where;
    if (st === 'order') return 'بيطلب ' + (r.task.product ? r.task.product.name : 'أكل') + where;
    if (st === 'pay') return 'بيدفع الحساب' + where;
    if (st === 'eat') return 'قاعد ياكل' + where;
  }
  if (r.task.kind === 'work' && place && sim.foodPlace(place) && r.duty) {
    if (r.duty.state === 'cook') return 'بيطبخ في ' + place.name;
    if (r.duty.state === 'carry') return 'شايل الأكل للكاونتر';
    return 'بيخدم الزباين في ' + place.name;
  }
  const label = TASK_LABEL[r.task.kind] || 'مشغول';
  if (r.phase === 'walk') return `رايح ${place ? place.name : 'مكان'}… ${label}`;
  return `${label}${place ? ' في ' + place.name : ''}`;
}

function setBar(el, value, color) {
  el.style.width = clamp(value, 0, 100) + '%';
  el.style.background = color;
}

function updateCard() {
  const r = sim.getResident(selectedId);
  const card = $('card');
  if (!r) { card.hidden = true; return; }
  card.hidden = false;
  $('rcAvatar').style.background = r.color;
  $('rcAvatar').textContent = r.name.slice(0, 1);
  $('rcName').textContent = r.name;
  $('rcJob').innerHTML =
    `<span>${r.jobTitle ? esc(r.jobTitle) + ' في ' + esc(sim.getPlace(r.workplaceId)?.name || '') : 'عاطل بيدور على شغل'}</span>` +
    `<span class="dot"></span><span>${esc(homeName(r))} • شقة ${ar(r.flatNo)}</span>`;
  $('rcMoney').textContent = ar(Math.round(r.money));
  setBar($('barFood'), 100 - r.hunger, r.hunger > 70 ? '#bc6047' : r.hunger > 45 ? '#d3a33f' : '#5f9e6a');
  setBar($('barEnergy'), r.energy, r.energy < 25 ? '#bc6047' : r.energy < 45 ? '#d3a33f' : '#5f9e6a');
  setBar($('barMood'), r.mood, moodColor(r.mood));
  const friends = Object.values(r.rel || {}).filter(v => v.aff >= 45).length;
  const hearts = r.crushes.length + sim.residents.filter(o => o.crushes.includes(r.id)).length;
  $('rcAction').innerHTML =
    `<b>دلوقتي:</b> ${esc(actionText(r))}` +
    ` <span class="rc-social">🤝 ${ar(friends)} أصحاب${hearts ? ' • ❤ ' + ar(r.crushes.length) : ''}</span>`;
  $('rcThought').innerHTML = `<span>💭</span><span>${r.thought ? esc(r.thought) : 'ساكت… بيفكر.'}</span>`;
}

let profileId = null;

function relBars(r) {
  const list = Object.entries(r.rel || {})
    .map(([id, rel]) => ({ p: sim.getResident(Number(id)), rel }))
    .filter(x => x.p && x.rel.aff >= 8)
    .sort((a, b) => b.rel.aff - a.rel.aff)
    .slice(0, 8);
  if (!list.length) return '<div class="prof-empty">لسه بياخد وقت عشان يتعرف على الناس.</div>';
  return list.map(({ p, rel }) => {
    const heart = r.crushes.includes(p.id) ? ' ❤' : '';
    return `<div class="relrow" data-id="${p.id}">
      <span class="relname">${esc(p.name)}${heart}</span>
      <div class="mini"><i style="width:${Math.round(rel.aff)}%"></i></div>
      <b>${rel.friends ? (rel.friends > 1 ? 'صاحب أوي' : 'صاحب') : ar(Math.round(rel.aff))}</b>
    </div>`;
  }).join('');
}

function renderProfile(r) {
  const place = r.jobTitle ? sim.getPlace(r.workplaceId) : null;
  const home = sim.getPlace(r.homeId);
  const likes = r.crushes.map(id => sim.getResident(id)).filter(Boolean);
  const likedBy = sim.residents.filter(o => o.crushes.includes(r.id));
  const quotes = r.quotes.slice(-8).reverse();
  const acts = uiLogs.filter(e => e.rid === r.id && e.kind !== 'talk').slice(-14).reverse();
  const friends = Object.values(r.rel || {}).filter(v => v.aff >= 45).length;

  $('peopleList').innerHTML = `
  <div class="prof">
    <button type="button" class="prof-back" data-back="1">→ كل البشر</button>
    <div class="prof-head">
      <div class="prof-ava" style="background:${r.color}">${esc(r.name.slice(0, 1))}<span>${r.gender === 'f' ? '♀' : '♂'}</span></div>
      <div class="prof-id">
        <div class="prof-name">${esc(r.name)}</div>
        <div class="prof-meta">${r.gender === 'f' ? (r.age < 30 ? 'بنت' : 'ست') : (r.age < 30 ? 'شاب' : 'راجل')} • ${ar(r.age)} سنة • ${esc(home ? home.name : '—')} شقة ${ar(r.flatNo)}</div>
        <div class="prof-meta">${place ? esc(r.jobTitle) + ' في ' + esc(place.name) : 'عاطل بيدور على شغل'}</div>
      </div>
    </div>
    <div class="prof-money"><strong>${ar(Math.round(r.money))}</strong><span>جنيه في الجيب</span>
      <em>💼 ${r.jobTitle ? 'شغال' : 'بيدور'}</em></div>
    <div class="prof-now"><b>دلوقتي:</b> ${esc(actionText(r))}</div>
    <div class="prof-thought"><span>💭</span><span>${esc(r.thought || 'ساكت… بيفكر.')}</span></div>
    <div class="prof-bars">
      <div class="pb"><span>الأكل</span><div class="mini"><i style="width:${Math.round(100 - r.hunger)}%;background:${r.hunger > 70 ? '#bc6047' : '#5f9e6a'}"></i></div></div>
      <div class="pb"><span>الطاقة</span><div class="mini"><i style="width:${Math.round(r.energy)}%;background:${r.energy < 30 ? '#bc6047' : '#5f9e6a'}"></i></div></div>
      <div class="pb"><span>المزاج</span><div class="mini"><i style="width:${Math.round(r.mood)}%;background:${moodColor(r.mood)}"></i></div></div>
    </div>

    <div class="prof-sec">📣 آخر كلامه <small>${ar(r.quotes.length)} كلمة</small></div>
    ${quotes.length ? quotes.map(q => `<div class="quote"><div>«${esc(q.text)}»</div>
      <span>${q.side === 'رد' ? 'ردّ على' : 'مع'} ${esc(q.to)} • يوم ${ar(q.day)} ${timeLabel(q.time)}</span></div>`).join('')
      : '<div class="prof-empty">لسه ما اتكلمش مع حد… دوس سرعة ٢× واستنى.</div>'}

    <div class="prof-sec">🤝 أصحابه وناسه <small>${ar(friends)} صاحب</small></div>
    ${relBars(r)}

    <div class="prof-sec">❤ اللي في قلبه</div>
    ${likes.length || likedBy.length ? `
      ${likes.map(p => `<div class="heartrow" data-id="${p.id}">💗 معجب بـ<b>${esc(p.name)}</b><span>${p.crushes.includes(r.id) ? 'والحب من الطرفين' : 'ومش عارف يقولها'}</span></div>`).join('')}
      ${likedBy.map(p => `<div class="heartrow" data-id="${p.id}">💌 <b>${esc(p.name)}</b> معجب بيه<span>وهو مش واخد باله</span></div>`).join('')}
    ` : '<div class="prof-empty">قلبه فاضي… مشغول بالشغل والإيجار.</div>'}

    <div class="prof-sec">👨‍👩‍👧 العيلة والبيت</div>
    ${(() => {
      const spouse = r.spouseId ? sim.getResident(r.spouseId) : null;
      const kids = (r.kids || []).map(id => sim.getResident(id)).filter(Boolean);
      const parents = (r.parents || []).map(id => sim.getResident(id)).filter(Boolean);
      const hh = sim.householdOf(r);
      const home = sim.getPlace(r.homeId);
      let out = '';
      out += `<div class="actrow"><span>${spouse ? '💍' : r.child ? '👶' : '—'}</span><div><b>الحالة</b>${
        spouse ? 'متجوز ' + esc(spouse.name) : r.child ? 'طفل في بيت أهله' : r.stage === 'engaged' ? 'متخطب' : 'أعزب'}</div></div>`;
      if (parents.length) out += `<div class="actrow"><span>👨‍👩</span><div><b>أهله</b>${parents.map(p => esc(p.name)).join(' و ')}</div></div>`;
      if (kids.length) out += `<div class="actrow"><span>🧒</span><div><b>عياله (${ar(kids.length)})</b>${kids.map(k => esc(k.name) + ' (' + ar(k.age) + ')').join(' • ')}</div></div>`;
      if (home) out += `<div class="actrow"><span>🏠</span><div><b>ساكن في</b>${esc(home.name)} • شقة ${ar(r.flatNo)} • إيجار ${money(r.rentAmount || 0)}${hh ? ' • العيلة كلها ' + ar(hh.members.length) + ' أفراد' : ''}</div></div>`;
      return out;
    })()}

    <div class="prof-sec">🚗 الشارع والأمن</div>
    ${(() => {
      const car = sim.carOf(r);
      const ride = sim.rideOf(r);
      let out = '';
      out += `<div class="actrow"><span>${sim.isAsleep(r) ? '💤' : sim.isLockedUp(r) ? '🚔' : '☀'}</span><div><b>دلوقتي</b>${
        sim.isAsleep(r) ? 'نايم جوه البيت' : sim.isLockedUp(r) ? 'محبوس في القسم لحد الصبح' : esc(actionText(r))}</div></div>`;
      if (car) out += `<div class="actrow"><span>🚗</span><div><b>عربيته</b>${esc(car.name)} • نمرة ${esc(car.plate)}${car.company ? ' • عربية المعرض' : ''}${car.installment ? ' • بالتقسيط' : ''}</div></div>`;
      if (r.carDebt && r.carDebt.left > 0) {
        out += `<div class="actrow"><span>🧾</span><div><b>قسط العربية</b>فاضل ${money(r.carDebt.left)} • بيتحصّل ${money(r.carDebt.daily)} في اليوم${r.carDebt.missed ? ` • متأخر ${ar(r.carDebt.missed)} يوم` : ''}</div></div>`;
      }
      if (ride && ride.state !== 'done') {
        const other = ride.driverId === r.id ? sim.getResident(ride.riderId) : sim.getResident(ride.driverId);
        out += `<div class="actrow"><span>🚕</span><div><b>مشوار</b>${esc(other ? other.name : '—')} • ${money(ride.fare)} • ${ride.state === 'waiting' ? 'مستني' : 'في الطريق'}</div></div>`;
      }
      out += `<div class="actrow"><span>${(r.record || 0) > 0 ? '🚨' : '✅'}</span><div><b>السجل الجنائي</b>${
        (r.record || 0) > 0 ? ar(r.record) + ' سابقة في القسم' : 'ملفه نضيف'}</div></div>`;
      if (r.thief && (r.record || 0) === 0) out += `<div class="actrow"><span>🕵️</span><div><b>ملاحظة</b>فيه كلام في الحارة إنه بيدور على حاجة سهلة بالليل…</div></div>`;
      return out;
    })()}

    <div class="prof-sec">🕘 آخر اللي عمله</div>
    ${acts.length ? acts.map(e => {
      const k = KINDS[e.kind] || KINDS.system;
      return `<div class="actrow"><span>${k.icon}</span><div><b>يوم ${ar(e.day)} • ${timeLabel(e.time)}</b>${esc(e.text)}</div></div>`;
    }).join('') : '<div class="prof-empty">لسه مفيش حاجة مسجلة.</div>'}

    <button type="button" class="prof-focus" data-focus="${r.id}">📍 بص عليه في الحارة</button>
  </div>`;
}

function renderPeople(force) {
  if ($('peopleBody').hidden && !force) return;
  if (!sim.residents.length) {
    profileId = null;
    peopleList.innerHTML = '<div class="log-empty">لسه مفيش سكان في الحارة.<br>استدعِ الحارة الأول.</div>';
    return;
  }
  const scroll = peopleList.scrollTop;
  if (profileId != null) {
    const r = sim.getResident(profileId);
    if (!r) profileId = null;
    else { renderProfile(r); peopleList.scrollTop = scroll; return; }
  }

  const head = `<div class="people-head">${ar(sim.residents.length)} إنسان في الحارة • <b>${ar(sim.employed)}</b> بيشتغلوا
    <span>دوس على أي حد تشوف حياته كلها</span></div>`;
  const rows = sim.residents.map(r => {
    const job = r.jobTitle ? esc(r.jobTitle) : 'عاطل';
    const friends = Object.values(r.rel || {}).filter(v => v.aff >= 45).length;
    const last = r.quotes.length ? r.quotes[r.quotes.length - 1] : null;
    const hearts = r.crushes.length;
    return `<div class="person ${r.id === selectedId ? 'sel' : ''}" data-id="${r.id}">
      <div class="avatar ${r.gender === 'f' ? 'f' : 'm'}" style="background:${r.color}">${esc(r.name.slice(0, 1))}</div>
      <div class="p-main">
        <div class="p-name">${esc(r.name)}<span class="gtag">${r.gender === 'f' ? '♀' : '♂'} ${ar(r.age)}</span>
          ${friends ? `<span class="pbadge">🤝 ${ar(friends)}</span>` : ''}${hearts ? `<span class="pbadge heart">❤ ${ar(hearts)}</span>` : ''}</div>
        <div class="p-sub"><span>${job}</span><span>•</span><span>${esc(homeName(r))}</span>
          <span class="mooddot" style="background:${moodColor(r.mood)}"></span></div>
        ${last ? `<div class="p-note">💬 «${esc(last.text)}»</div>` : '<div class="p-note muted">لسه ما اتكلمش مع حد</div>'}
      </div>
      <div class="p-money">${ar(Math.round(r.money))}<small>جنيه</small></div>
    </div>`;
  }).join('');
  peopleList.innerHTML = head + rows;
  peopleList.scrollTop = scroll;
}

function openProfile(id) {
  profileId = id;
  select(id);
  const r = sim.getResident(id);
  if (!r) return;
  const p = $('peopleBody');
  if (p.hidden) {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === 'people'));
    $('logBody').hidden = true;
    $('peopleBody').hidden = false;
    $('townBody').hidden = true;
    $('filters').style.display = 'none';
  }
  renderPeople(true);
  peopleList.scrollTop = 0;
  if (placeId) { placeId = null; $('placeCard').hidden = true; }
}

function focusResident(r) {
  cam.zoom = Math.max(cam.zoom, 1.45);
  cam.x = r.x;
  cam.y = r.y;
  clampCam();
}

function renderTown() {
  const res = sim.residents;
  const avgMood = res.length ? res.reduce((s, r) => s + r.mood, 0) / res.length : 0;
  $('statPop').textContent = ar(res.length);
  $('statJobs').textContent = ar(sim.employed);
  $('statMoney').textContent = ar(Math.round(sim.totalMoney));
  $('statMood').textContent = ar(Math.round(avgMood)) + '٪';
  $('statRent').textContent = ar(Math.round(sim.stats.rent));
  $('statBills').textContent = ar(Math.round(sim.stats.bills));
  $('statEarned').textContent = ar(Math.round(sim.stats.earned));
  $('statMeals').textContent = ar(sim.stats.meals);

  const mod = sim.mod;
  const modEl = $('modCard');
  if (mod.name) {
    const left = Math.max(0, Math.round((mod.until - sim.minute) / 60));
    modEl.innerHTML = `<b>${esc(mod.name)}</b> — فاضل ${ar(left)} ساعة.` +
      (sim.powerCut ? ' <br>الكهربا مقطوعة في الحارة.' : '');
  } else {
    modEl.textContent = 'الحارة هادية… مفيش حاجة مقلقلة.';
  }

  const evs = sim.events.slice(-6).reverse();
  $('eventList').innerHTML = evs.length
    ? evs.map(e => `<div class="event-row"><span class="ed">اليوم ${ar(e.day)}</span><span>${esc(e.name)}</span></div>`).join('')
    : '<div class="about-note" style="margin:0">لسه مفيش أحداث كبيرة.</div>';
}

function syncHud() {
  $('dayLabel').textContent = 'اليوم ' + ar(sim.day);
  $('clock').textContent = timeLabel(sim.minute);
  const t = tod(sim.minute);
  $('calIcon').textContent = (t >= 6 * 60 && t < 18 * 60) ? '☀' : '🌙';
}

/* ------------------------------------------------------------
   places: card, entering, building centre
   ------------------------------------------------------------ */
function placeIcon(p) {
  if (p.style === 'police') return '🚓';
  if (p.style === 'dealer') return '🚗';
  if (p.style === 'pitch') return '⚽';
  if (p.style === 'lot') return '🪵';
  if (p.style === 'apartment') return '🏠';
  if (p.style === 'cafe') return '☕';
  if (p.style === 'mosque') return '🕌';
  if (p.style === 'school') return '🏫';
  if (p.style === 'workshop') return '🔧';
  if (p.style === 'bakery') return '🍞';
  if (p.style === 'shop' || p.style === 'kiosk') return '🏪';
  if (p.style === 'market') return '🥕';
  if (p.style === 'pharmacy') return '💊';
  if (p.style === 'youth' || p.style === 'pitch') return '⚽';
  if (p.style === 'garage') return '🛺';
  if (p.style === 'office') return '🏛️';
  if (p.style === 'charity') return '🍲';
  if (p.style === 'lot') return '🪵';
  return '🏢';
}

function selectPlace(id) {
  placeId = id;
  const card = $('placeCard');
  const p = id ? sim.getPlace(id) : null;
  if (!p) { card.hidden = true; return; }
  card.hidden = false;
  updatePlaceCard();
}

function updatePlaceCard() {
  const p = sim.getPlace(placeId);
  const card = $('placeCard');
  if (!p) { card.hidden = true; return; }
  const st = sim.shopStatus(p);
  $('plAvatar').textContent = placeIcon(p);
  $('plName').textContent = p.name;
  const owner = p.ownerId ? sim.getResident(p.ownerId) : null;
  const staff = sim.staffOf(p);
  const worker = staff.length ? staff[0].worker : null;
  const rows = [];

  $('plMeta').innerHTML = [
    p.kind === 'home' ? 'عمارة سكنية' : p.kind === 'land' ? (p.project ? 'بيتبني' : 'أرض فاضية') : 'محل في الحارة',
    owner ? '• مالك: ' + esc(owner.name) : '',
  ].filter(Boolean).join(' ');

  if (p.kind === 'land') {
    $('plStatus').className = 'pl-status';
    if (p.project) {
      $('plStatus').textContent = '🏗️ بيتبني — ' + ar(Math.round(p.project.progress)) + '٪';
      rows.push(`<div class="pl-row"><span>المشروع</span><b>${esc(p.project.name)}</b></div>`);
      rows.push(`<div class="pl-row"><span>صاحب البناء</span><b>${owner ? esc(owner.name) : 'البلدية'}</b></div>`);
      rows.push(`<div class="pl-row"><span>التكلفة</span><b>${money(p.project.cost)}</b></div>`);
      rows.push(`<div class="pl-bar"><i style="width:${Math.round(p.project.progress)}%"></i></div>`);
      if (worker) rows.push(`<div class="pl-row"><span>بيشتغل فيها</span><b>${esc(worker.name)}</b></div>`);
    } else {
      $('plStatus').textContent = '🪵 أرض فاضية — جاهزة للبناء';
      rows.push(`<div class="pl-row"><span>تكلفة البناء</span><b>${money(1400)}</b></div>`);
      rows.push(`<div class="pl-row"><span>النتيجة</span><b>عمارة بشقتين للسكن</b></div>`);
      const can = sim.freeLots().some(l => l.id === p.id);
      rows.push(`<button class="pl-enter" data-build="${p.id}" ${can ? '' : 'disabled'}>ابدأ البناء هنا 🏗️</button>`);
    }
  } else if (p.kind === 'home') {
    const used = sim.flatUse(p);
    const free = sim.freeFlatsIn(p);
    const tenants = sim.residents.filter(r => r.homeId === p.id);
    $('plStatus').className = 'pl-status ' + (free > 0 ? 'open' : 'closed');
    $('plStatus').textContent = `🏠 ${ar(used)}/${ar(p.flats || 0)} شقق مشغولة${free ? ' — فيه شقة فاضية' : ''}`;
    rows.push(`<div class="pl-row"><span>الإيجار</span><b>${money(p.rent || 0)}</b></div>`);
    rows.push(`<div class="pl-row"><span>المالك</span><b>${owner ? esc(owner.name) : 'البلدية'}</b></div>`);
    rows.push(`<div class="pl-row"><span>شقق فاضية</span><b class="${free ? 'ok' : 'bad'}">${ar(free)}</b></div>`);
    const households = sim.households.filter(h => h.homeId === p.id);
    if (households.length) {
      rows.push(`<div class="pl-row"><span>عيلات</span><b>${ar(households.length)}</b></div>`);
      rows.push(`<div class="pl-people">${households.map(h => h.members.map(id => sim.getResident(id)).filter(Boolean)
        .map(m => `<span class="pl-chip" data-rid="${m.id}">${esc(m.name)}</span>`).join('')).join('')}</div>`);
    }
    if (tenants.length) {
      rows.push(`<div class="pl-row"><span>الساكنين</span><b>${ar(tenants.length)}</b></div>`);
      rows.push(`<div class="pl-people">${tenants.slice(0, 10).map(t => `<span class="pl-chip" data-rid="${t.id}">${esc(t.name)}${t.child ? ' 👶' : ''}</span>`).join('')}</div>`);
    }
  } else if (p.id === 'dealer') {
    $('plStatus').className = 'pl-status open';
    $('plStatus').textContent = '🚗 معرض مفتوح — عربيات للبيع والتوصيل';
    rows.push(`<div class="pl-row"><span>سواقين في الشيفت</span><b>${ar(sim.drivers().length)}</b></div>`);
    rows.push(`<div class="pl-row"><span>مشاوير اتعملت</span><b>${ar(sim.stats.rides || 0)} • ${money(sim.stats.fares || 0)}</b></div>`);
    rows.push(`<div class="pl-row"><span>عربيات في الحارة</span><b>${ar(sim.cars.length)}</b></div>`);
    rows.push('<div class="pl-sub">عربيات المعرض</div>');
    const downOf = (cm) => Math.round(cm.price * CAR_DOWN_RATE);
    for (const cm of CAR_MODELS) {
      const afford = sim.residents.filter(r => !r.child && !sim.carOf(r) && r.money >= cm.price).length;
      const fin = sim.residents.filter(r => !r.child && !sim.carOf(r) && r.money >= downOf(cm)).length;
      rows.push(`<div class="pl-car">
        <div class="pl-car-id"><b>${cm.name}</b><small>${money(cm.price)} • مقدم ${money(downOf(cm))}</small></div>
        <button class="pl-buy" data-buy="${cm.id}" ${afford ? '' : 'disabled'}>كاش</button>
        <button class="pl-buy alt" data-buyinst="${cm.id}" ${fin ? '' : 'disabled'}>تقسيط</button>
      </div>`);
    }
    const owned = sim.cars.slice(-8).reverse();
    if (owned.length) {
      rows.push('<div class="pl-sub">مركونة عند البيوت</div>');
      rows.push(`<div class="pl-people">${owned.map(c => {
        const o = sim.getResident(c.ownerId);
        return `<span class="pl-chip" data-rid="${o ? o.id : ''}">${esc(o ? o.name.split(' ')[0] : 'المعرض')} • ${esc(c.name)} • ${esc(c.plate)}</span>`;
      }).join('')}</div>`);
    }
    const rides = sim.rides.filter(r => r.state !== 'done');
    if (rides.length) {
      rows.push('<div class="pl-sub">مشاوير شغالة</div>');
      for (const rd of rides.slice(0, 4)) {
        const rr = sim.getResident(rd.riderId);
        const dd = sim.getResident(rd.driverId);
        rows.push(`<div class="pl-row"><span>${rr ? esc(rr.name) : '—'} → ${esc((sim.getPlace(rd.destId) || {}).name || '—')}</span><b>${dd ? esc(dd.name.split(' ')[0]) : 'مستني'} • ${money(rd.fare)}</b></div>`);
      }
    }
  } else if (p.id === 'police') {
    const cops = sim.officers();
    const open = sim.incidents.filter(i => !i.solved);
    $('plStatus').className = 'pl-status ' + (cops.length ? 'open' : 'closed');
    $('plStatus').textContent = cops.length ? `🚓 القسم شغال — ${ar(cops.length)} ظابط` : '🚓 مفيش ظابط في القسم';
    rows.push(`<div class="pl-row"><span>بلاغات مفتوحة</span><b class="${open.length ? 'bad' : 'ok'}">${ar(open.length)}</b></div>`);
    rows.push(`<div class="pl-row"><span>اتقبض عليهم</span><b>${ar(sim.stats.arrests || 0)}</b></div>`);
    rows.push(`<div class="pl-row"><span>فلوس اترجعت</span><b>${money(sim.stats.recovered || 0)}</b></div>`);
    if (cops.length) {
      rows.push('<div class="pl-sub">الظباط</div>');
      rows.push(`<div class="pl-people">${cops.map(c => `<span class="pl-chip" data-rid="${c.id}">${esc(c.name)}${c.onDuty ? ' 🚨' : ''}</span>`).join('')}</div>`);
    }
    if (open.length) {
      rows.push('<div class="pl-sub">قضايا</div>');
      for (const inc of open.slice(-4)) {
        const home = inc.homeId ? sim.getPlace(inc.homeId) : null;
        const victim = inc.victimId ? sim.getResident(inc.victimId) : null;
        rows.push(`<div class="pl-row"><span>${inc.type === 'mugging' ? 'خطف في الشارع' : 'سرقة'} ${home ? '• ' + esc(home.name) : ''}</span><b>${victim ? esc(victim.name.split(' ')[0]) : '—'} • ${money(inc.amount || 0)}</b></div>`);
      }
    }
  } else {
    $('plStatus').className = 'pl-status ' + (st.open ? 'open' : 'closed');
    $('plStatus').textContent = (st.open ? '● ' : '● ') + st.label;
    rows.push(`<div class="pl-row"><span>البياع</span><b>${worker ? esc(worker.name) : 'مفيش حد'}</b></div>`);
    rows.push(`<div class="pl-row"><span>المواعيد</span><b>${st.job ? timeLabel(st.job.start) + ' — ' + timeLabel(st.job.end) : '—'}</b></div>`);
    if (sim.foodPlace(p)) {
      rows.push(`<div class="pl-row"><span>المخزون</span><b class="${p.stock > 3 ? 'ok' : 'bad'}">${ar(p.stock)} / ${ar(p.stockMax)}</b></div>`);
      rows.push(`<div class="pl-bar"><i style="width:${Math.round(100 * p.stock / (p.stockMax || 1))}%"></i></div>`);
      rows.push(`<div class="pl-row"><span>في الطابور</span><b>${ar(p.queue.length)}</b></div>`);
      rows.push(`<div class="pl-row"><span>بيع النهاردة</span><b>${ar(p.salesToday || 0)} طلب</b></div>`);
    }
    const queued = sim.sideOfShop(p);
    if (queued.length) rows.push(`<div class="pl-people">${queued.map(q => `<span class="pl-chip" data-rid="${q.id}">${esc(q.name)}</span>`).join('')}</div>`);
  }

  $('plBody').innerHTML = rows.join('');
  const enterBtn = $('plEnter');
  enterBtn.disabled = p.kind === 'land';
  enterBtn.textContent = p.kind === 'land' ? 'مفيش حاجة تدخلها' : 'ادخل المكان 🚪';
}

function renderBuild() {
  if (!sim.started) return;
  const lots = sim.places.filter(p => p.kind === 'land');
  const homes = sim.places.filter(p => p.kind === 'home');
  const projects = sim.projects.filter(p => !p.done);
  const vacant = homes.reduce((n, h) => n + sim.freeFlatsIn(h), 0);

  $('bldHomes').textContent = ar(homes.length);
  $('bldLots').textContent = ar(sim.freeLots().length);
  $('bldProjects').textContent = ar(projects.length);
  $('bldVacant').textContent = ar(vacant);
  $('bldCost').textContent = ar(1400);

  $('lotList').innerHTML = lots.map(l => {
    const pr = l.project;
    const owner = pr && pr.ownerId ? sim.getResident(pr.ownerId) : null;
    if (pr) {
      const crew = sim.workerAt(l.id);
      return `<div class="lot-row">
        <div class="lh"><b>🏗️ ${esc(pr.name)}</b><small>${ar(Math.round(pr.progress))}٪</small></div>
        <div class="prog"><i style="width:${Math.round(pr.progress)}%"></i></div>
        <small>${owner ? 'صاحب البناء: ' + esc(owner.name) : 'بناء البلدية'}${crew ? ' • ' + esc(crew.name) + ' بيشتغل' : ' • مستني عمال'}</small>
      </div>`;
    }
    return `<div class="lot-row">
      <div class="lh"><b>🪵 أرض فاضية</b><small>${money(1400)}</small></div>
      <small>تقدر تبني هنا عمارة بشقتين، والسكان يسكنوا فيها بالإيجار.</small>
      <button class="row-btn" data-build="${l.id}">ابدأ البناء 🏗️</button>
    </div>`;
  }).join('') || '<div class="build-note">مفيش أراضي فاضية… الحارة اتملت.</div>';

  $('homeList').innerHTML = homes.map(h => {
    const used = sim.flatUse(h);
    const free = sim.freeFlatsIn(h);
    const owner = h.ownerId ? sim.getResident(h.ownerId) : null;
    const tenants = sim.residents.filter(r => r.homeId === h.id);
    const tags = [];
    if (free > 0) tags.push(`<span class="tag free">${ar(free)} شقة فاضية</span>`);
    if (owner) tags.push(`<span class="tag owned">مالك: ${esc(owner.name)}</span>`);
    tags.push(`<span class="tag">إيجار ${money(h.rent || 0)}</span>`);
    return `<div class="home-row">
      <div class="lh"><b>${placeIcon(h)} ${esc(h.name)}</b><small>${ar(used)}/${ar(h.flats || 0)}</small></div>
      <div class="tags">${tags.join('')}</div>
      <small>${tenants.length ? tenants.slice(0, 8).map(t => esc(t.name) + (t.child ? ' 👶' : '')).join(' • ') : 'فاضي — محدش ساكن'}</small>
    </div>`;
  }).join('');

  const vacantList = homes.filter(h => sim.freeFlatsIn(h) > 0)
    .sort((a, b) => (a.rent || 0) - (b.rent || 0))
    .slice(0, 6)
    .map(h => `<div class="home-row"><div class="lh"><b>${esc(h.name)}</b><small>${money(h.rent || 0)}</small></div>
      <small>${ownerLabel(h)}</small></div>`).join('');
  $('marketList').innerHTML = vacantList
    ? `<div class="section-title">شقق للإيجار</div>${vacantList}`
    : '';
}

function ownerLabel(home) {
  const owner = home.ownerId ? sim.getResident(home.ownerId) : null;
  return owner ? 'المالك: ' + owner.name + ' — بيحصل على الإيجار' : 'إيجار البلدية';
}

function skipToMorning() {
  const res = sim.skipNight();
  if (res.ok) {
    sim.toast(`الصبح جه ☀ — ${ar(Math.round(res.skipped / 60))} ساعة عدّت`);
    renderStreet();
    if (placeId) updatePlaceCard();
    return true;
  }
  const awake = res.awake || [];
  if (awake.length) {
    const names = awake.slice(0, 3).map(a => a.name.split(' ')[0]).join('، ');
    sim.toast(`مش هينفع: ${res.reason} (${ar(awake.length)}) — ${names}`);
  } else {
    sim.toast(res.reason || 'مش هينفع دلوقتي');
  }
  setTab('street');
  renderStreet();
  return false;
}

function setTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const map = { log: 'logBody', people: 'peopleBody', town: 'townBody', build: 'buildBody', street: 'streetBody' };
  Object.entries(map).forEach(([k, id]) => { const el = $(id); if (el) el.hidden = k !== tab; });
  if (tab === 'street') renderStreet();
  if (tab === 'build') renderBuild();
  if (tab === 'town') renderTown();
  if (tab === 'people') renderPeople(true);
}

function renderStreet() {
  const box = $('streetList');
  if (!box) return;
  const awake = sim.awakeList();
  const asleep = sim.residents.length - awake.length;
  const out = [];

  out.push('<div class="section-title">الليل والنوم</div>');
  out.push(`<div class="st-card">
    <div class="st-row"><span>نايمين دلوقتي</span><b class="${awake.length ? 'bad' : 'ok'}">${ar(asleep)} / ${ar(sim.residents.length)}</b></div>
    <div class="st-row"><span>الساعة</span><b>${timeLabel(sim.minute)}</b></div>
    ${awake.length
      ? `<div class="st-note"><b>الصاحيين:</b><br>${awake.slice(0, 8).map(a => `${esc(a.name)} — ${esc(a.why)} <i>(${esc(a.where)})</i>`).join('<br>')}${awake.length > 8 ? `<br>… و${ar(awake.length - 8)} كمان` : ''}</div>`
      : '<div class="st-note ok">كل الحارة نايمة… تقدر تطوّل لحد الصبح</div>'}
    <button class="pl-enter" data-night="1" ${awake.length ? 'disabled' : ''}>🌙 نم لحد الصبح</button>
  </div>`);

  const rides = sim.rides.filter(r => r.state !== 'done');
  out.push('<div class="section-title">المشاوير (تاكسي الحارة)</div>');
  out.push(`<div class="st-row"><span>سواقين</span><b>${ar(sim.drivers().length)} • ${ar(sim.cars.length)} عربية</b></div>`);
  out.push(`<div class="st-row"><span>مشاوير اتعملت</span><b class="ok">${ar(sim.stats.rides || 0)} • ${money(sim.stats.fares || 0)}</b></div>`);
  if (!rides.length) out.push('<div class="st-note">مفيش مشاوير دلوقتي… الناس بتمشي على رجليها.</div>');
  for (const rd of rides) {
    const rider = sim.getResident(rd.riderId);
    const driver = sim.getResident(rd.driverId);
    const dest = sim.getPlace(rd.destId);
    const state = rd.state === 'waiting' ? 'مستني عربية' : rd.state === 'pickup' ? 'السواق في السكة' : 'في الطريق';
    out.push(`<div class="st-line"><b>${rider ? esc(rider.name) : '—'}</b> → ${dest ? esc(dest.name) : '—'}<span>${state} • ${driver ? esc(driver.name.split(' ')[0]) : '—'} • ${money(rd.fare)}</span></div>`);
  }

  out.push('<div class="section-title">العربيات</div>');
  if (!sim.cars.length) out.push('<div class="st-note">مفيش عربيات في الحارة… المعرض فيه عربيات للبيع.</div>');
  for (const car of sim.cars.slice(-10).reverse()) {
    const owner = sim.getResident(car.ownerId);
    out.push(`<div class="st-line"><b>${esc(car.name)}</b> • ${esc(car.plate)}<span>${owner ? esc(owner.name) : 'عربية المعرض'}${car.company ? ' • شركة' : ''}</span></div>`);
  }

  out.push('<div class="section-title">الشرطة والجرائم</div>');
  out.push(`<div class="st-row"><span>ظباط</span><b>${ar(sim.officers().length)}</b></div>`);
  out.push(`<div class="st-row"><span>بلاغات مفتوحة</span><b class="${sim.incidents.filter(i => !i.solved).length ? 'bad' : 'ok'}">${ar(sim.incidents.filter(i => !i.solved).length)}</b></div>`);
  out.push(`<div class="st-row"><span>اتقبض / اترجع</span><b>${ar(sim.stats.arrests || 0)} • ${money(sim.stats.recovered || 0)}</b></div>`);
  for (const inc of sim.incidents.slice(-5).reverse()) {
    const home = inc.homeId ? sim.getPlace(inc.homeId) : null;
    const thief = inc.thiefId ? sim.getResident(inc.thiefId) : null;
    const state = inc.solved ? '✅ اتحلت' : inc.officerId ? '🚓 بيحقق' : inc.reported ? '📋 بلاغ' : '🔕 متبلّغش';
    out.push(`<div class="st-line"><b>${inc.type === 'mugging' ? 'خطف' : 'سرقة'}</b> ${home ? '• ' + esc(home.name) : ''}<span>${money(inc.amount || 0)} • ${state}${thief ? ' • ' + esc(thief.name.split(' ')[0]) : ''}</span></div>`);
  }

  out.push('<div class="section-title">الكورة</div>');
  if (!sim.matches.length) out.push('<div class="st-note">مفيش ماتش دلوقتي… العيال في البيت أو المدرسة.</div>');
  for (const m of sim.matches) {
    const where = m.placeId ? (sim.getPlace(m.placeId) || {}).name : 'شارع الحارة';
    out.push(`<div class="st-line"><b>${esc(where)}</b> • ${ar(m.players.length)} لاعب<span>النتيجة ${ar(m.scoreA)}–${ar(m.scoreB)} • لحد ${timeLabel(m.until)}</span></div>`);
  }

  box.innerHTML = out.join('');
}

function buyCarFor(modelId, installment = false) {
  const res = sim.playerBuyCar(modelId, null, { installment: !!installment });
  if (!res.ok) { sim.toast('مش قادر: ' + res.reason); return; }
  sim.toast(installment ? `${res.car.name} بالتقسيط — مقدم اتدفع 🚗` : `${res.car.name} بقت لساكن جديد 🚗`);
  updatePlaceCard();
  renderStreet();
}

function buildHere(lotId) {
  const res = sim.startProject(lotId, {});
  if (!res.ok) { sim.toast('مش قادر أبني: ' + res.reason); return; }
  sim.toast('بدأ البناء في الأرض الفاضية… استنى العمال');
  renderBuild();
  if (placeId === lotId) updatePlaceCard();
}

/* ------------------------------------------------------------
   saving (localStorage — same shape as sim.serialize())
   ------------------------------------------------------------ */
/* مفتاح الحفظ بييجي من المحرّك نفسه عشان مايتفرّقش */

function removeAllSaves() {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const k of LEGACY_SAVE_KEYS) localStorage.removeItem(k);
  } catch (e) {}
}

function hasSave() {
  try {
    if (localStorage.getItem(SAVE_KEY)) return true;
    return LEGACY_SAVE_KEYS.some(k => !!localStorage.getItem(k));
  } catch (e) { return false; }
}

function saveGame(showToast) {
  if (!sim.started) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize()));
    if (showToast) sim.toast('الحارة اتحفظت 💾');
    return true;
  } catch (e) {
    if (showToast) sim.toast('المتصفح مش سامح بالحفظ');
    return false;
  }
}

function applyLoadedState() {
  sim.residents.forEach(r => { r.spawnAt = 0; r._bubbleAt = 0; r._seenSpeech = ''; });
  sim.places.forEach(p => { p.appear = 0; });
  uiLogs = sim.logs.slice(-300);
  logRows = 0;
  logList.innerHTML = '';
  const rows = uiLogs.filter(FILTERS[filter]).slice(-200).reverse();
  if (rows.length) {
    const frag = document.createDocumentFragment();
    for (const e of rows) frag.appendChild(logRow(e, false));
    logList.appendChild(frag);
    logRows = rows.length;
  } else {
    logList.innerHTML = '<div class="log-empty">السجل فاضي… سيب الحارة تعيش.</div>';
  }
  $('intro').hidden = true;
  $('hint').classList.add('gone');
  selectedId = null;
  placeId = null;
  profileId = null;
  $('card').hidden = true;
  $('placeCard').hidden = true;
  insideId = null;
  $('insideBar').hidden = true;
  cam.zoom = 1;
  cam.x = WORLD.w / 2;
  cam.y = WORLD.h / 2;
  clampCam();
  renderPeople(true);
  renderTown();
  renderBuild();
  syncHud();
}

/* مفاتيح الحفظ القديمة — بنقرا منها ونطوّرها لآخر نسخة */
const LEGACY_SAVE_KEYS = ['harat.save.v3', 'harat.save.v2'];

function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    let migrated = false;
    if (!raw) {
      for (const k of LEGACY_SAVE_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) { migrated = true; break; }
      }
    }
    if (!raw) return false;
    const data = JSON.parse(raw);
    const res = sim.hydrate(data);
    if (!res.ok) {
      if (!hasSave()) sim.toast('مش قادر أفتح الحفظ: ' + res.reason);
      return false;
    }
    applyLoadedState();
    if (migrated) { saveGame(); sim.toast('الحفظ القديم اتطوّر لآخر نسخة 💾'); }
    return true;
  } catch (e) {
    return false;
  }
}

function hitPlace(wx, wy) {
  let best = null;
  for (const p of sim.places) {
    if (p.style === 'lot' && !p.project) {
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) best = p;
      continue;
    }
    if (wx >= p.x && wx <= p.x + p.w && wy >= p.y - 12 && wy <= p.y + p.h + 14) {
      if (!best || p.y + p.h > best.y + best.h) best = p;
    }
  }
  return best;
}

function hitInterior(mx, my) {
  const place = sim.getPlace(insideId);
  if (!place) return null;
  const { rw, rh, rx, ry } = interiorLayout();
  let best = null, bd = 46;
  for (const r of sim.insideResidents(place)) {
    const slot = sim.interiorSlot(r, place);
    if (!slot) continue;
    const px = rx + rw * slot.x, py = ry + rh * slot.y - 34;
    const d = Math.hypot(mx - px, my - py);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/* ------------------------------------------------------------
   events / controls
   ------------------------------------------------------------ */
$('startBtn').addEventListener('click', () => {
  $('intro').hidden = true;
  removeAllSaves();
  sim.summonTown();
  const now = performance.now();
  sim.places.forEach((p, i) => { p.appear = now + i * 42; });
  sim.residents.forEach((r, i) => { r.spawnAt = now + 500 + i * 180; });
  sim.onToast('الحارة اتولدت… بص على الناس');
  if (firstStart) {
    firstStart = false;
    setTimeout(() => $('hint').classList.add('gone'), 14000);
  }
});

$('addBtn').addEventListener('click', () => {
  if (!sim.started) { sim.onToast('استدعِ الحارة الأول'); return; }
  const r = sim.spawnResident();
  if (r) {
    r.spawnAt = performance.now();
    sim.onToast('وصل ساكن جديد: ' + r.name);
    renderPeople(true);
  }
});

let resetArmed = false;
let resetTimer = 0;
$('resetBtn').addEventListener('click', () => {
  if (!sim.started) return;
  if (!resetArmed) {
    resetArmed = true;
    $('resetBtn').classList.add('danger-armed');
    $('resetBtn').textContent = '؟';
    sim.onToast('دوس تاني لو عايز تبدأ حارة جديدة');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      $('resetBtn').classList.remove('danger-armed');
      $('resetBtn').textContent = '↺';
    }, 3200);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  $('resetBtn').classList.remove('danger-armed');
  $('resetBtn').textContent = '↺';
  resetGame();
});

function resetGame() {
  removeAllSaves();
  sim.reset();
  insideId = null;
  sim.insideId = null;
  $('insideBar').hidden = true;
  placeId = null;
  $('placeCard').hidden = true;
  uiLogs = [];
  fxList.length = 0;
  profileId = null;
  selectedId = null;
  hoverId = null;
  $('card').hidden = true;
  logList.innerHTML = '<div class="log-empty">لسه الحارة ما اتولدتش…<br>دوس «استدعِ الحارة» وابدأ تتفرج.</div>';
  logRows = 0;
  renderPeople(true);
  renderTown();
  cam.zoom = 1;
  cam.x = WORLD.w / 2;
  cam.y = WORLD.h / 2;
  clampCam();
  $('intro').hidden = false;
  syncSpeedButtons();
}

$('rcClose').addEventListener('click', () => select(null));

$('exportBtn').addEventListener('click', () => {
  if (!sim.started || !sim.logs.length) { sim.onToast('لسه مفيش سجل تنزّله'); return; }
  const lines = sim.logs.map(e => {
    const kind = (KINDS[e.kind] || KINDS.system).label;
    return `[يوم ${e.day} — ${timeLabel(e.time)}] (${kind})${e.name ? ' ' + e.name + ':' : ''} ${e.text}`;
  });
  const text = 'حياة الحارات — سجل الحارة كامل\n' + '='.repeat(40) + '\n' + lines.join('\n') + '\n';
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'حياة-الحارات-السجل.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    sim.onToast('السجل اتنزّل');
  } catch (err) {
    sim.onToast('المتصفح مش سامح بالتنزيل');
  }
});

$('bubbleBtn').addEventListener('click', () => {
  showBubbles = !showBubbles;
  $('bubbleBtn').classList.toggle('ghost-on', showBubbles);
  sim.onToast(showBubbles ? 'الخواطر ظاهرة فوق الناس' : 'الخواطر اتخبت');
});

document.querySelectorAll('[data-speed]').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = Number(btn.dataset.speed);
    if (v === 0) {
      sim.paused = !sim.paused;
    } else {
      sim.paused = false;
      sim.speed = v;
    }
    syncSpeedButtons();
  });
});

function syncSpeedButtons() {
  document.querySelectorAll('[data-speed]').forEach(btn => {
    const v = Number(btn.dataset.speed);
    const on = v === 0 ? sim.paused : (!sim.paused && sim.speed === v);
    btn.classList.toggle('on', on);
  });
}

document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b === btn));
    setTab(tab);
    $('filters').style.display = tab === 'log' ? 'flex' : 'none';
    if (tab === 'build') renderBuild();
    if (tab === 'people') renderPeople(true);
    if (tab === 'town') renderTown();
    if (tab === 'town') renderTown();
  });
});

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('on', b === btn));
    rebuildLogs();
  });
});

logList.addEventListener('click', e => {
  const row = e.target.closest('.log-row[data-rid]');
  if (!row) return;
  select(Number(row.dataset.rid));
});

peopleList.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) {
    profileId = null;
    renderPeople(true);
    peopleList.scrollTop = 0;
    return;
  }
  const focusBtn = e.target.closest('[data-focus]');
  if (focusBtn) {
    const r = sim.getResident(Number(focusBtn.dataset.focus));
    if (r) { focusResident(r); sim.onToast('ودّينا الكاميرا على ' + r.name); }
    return;
  }
  const row = e.target.closest('[data-id]');
  if (!row) return;
  openProfile(Number(row.dataset.id));
});

/* canvas interactions */
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, moved: false };
  canvas.classList.add('dragging');
});
let drag = null;
canvas.addEventListener('pointermove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  mouse.in = true;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) {
      const s = cam.fit * cam.zoom;
      cam.x = drag.camX - dx / s;
      cam.y = drag.camY - dy / s;
      clampCam();
    }
  } else {
    const w = screenToWorld(mouse.x, mouse.y);
    const hit = hitResident(w.x, w.y);
    hoverId = hit ? hit.id : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  }
});
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('dragging');
  if (drag && !drag.moved) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (insideId) {
      const person = hitInterior(mx, my);
      if (person) select(person.id);
      return;
    }
    const w = screenToWorld(mx, my);
    const hit = hitResident(w.x, w.y);
    if (hit) { select(hit.id); return; }
    const place = hitPlace(w.x, w.y);
    if (place) selectPlace(place.id);
    else { selectPlace(null); select(null); }
  }
  drag = null;
});
canvas.addEventListener('pointerleave', () => { hoverId = null; mouse.in = false; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-e.deltaY * 0.0016);
  zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });
canvas.addEventListener('dblclick', () => {
  cam.zoom = 1;
  cam.x = WORLD.w / 2;
  cam.y = WORLD.h / 2;
  clampCam();
});

$('zoomIn').addEventListener('click', () => zoomAt(1.25, VW / 2, VH / 2));
$('zoomOut').addEventListener('click', () => zoomAt(0.8, VW / 2, VH / 2));

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space' || e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    sim.paused = !sim.paused;
    syncSpeedButtons();
  } else if (e.key === '1') { sim.paused = false; sim.speed = 1; syncSpeedButtons(); }
  else if (e.key === '2') { sim.paused = false; sim.speed = 2; syncSpeedButtons(); }
  else if (e.key === '3' || e.key === '4') { sim.paused = false; sim.speed = 4; syncSpeedButtons(); }
  else if (e.key === 'b' || e.key === 'B') { $('bubbleBtn').click(); }
  else if (e.key === '+' || e.key === '=') zoomAt(1.2, VW / 2, VH / 2);
  else if (e.key === '-') zoomAt(0.85, VW / 2, VH / 2);
  else if (e.key === 'Escape') {
    if (insideId) exitPlace();
    else if (placeId) selectPlace(null);
    else select(null);
  }
});

$('saveBtn').addEventListener('click', () => saveGame(true));

$('resumeBtn').addEventListener('click', () => {
  if (loadGame()) sim.toast('استكملت الحارة المحفوظة');
  else { $('resumeBtn').hidden = true; sim.onToast('مفيش حفظ صالح'); }
});

$('exitBtn').addEventListener('click', () => exitPlace());

const nightBtn = $('nightBtn');
if (nightBtn) nightBtn.addEventListener('click', () => skipToMorning());
const streetBody = $('streetBody');
if (streetBody) streetBody.addEventListener('click', e => {
  if (e.target.closest('[data-night]')) skipToMorning();
  const chip = e.target.closest('[data-rid]');
  if (chip && chip.dataset.rid) { const r = sim.getResident(Number(chip.dataset.rid)); if (r) { select(r.id); openProfile(r.id); } }
});

$('plClose').addEventListener('click', () => selectPlace(null));
$('plEnter').addEventListener('click', () => {
  if (placeId) enterPlace(placeId);
});

$('placeCard').addEventListener('click', e => {
  const buildBtn = e.target.closest('[data-build]');
  if (buildBtn) { buildHere(buildBtn.dataset.build); return; }
  const buyBtn = e.target.closest('[data-buy]');
  if (buyBtn) { buyCarFor(buyBtn.dataset.buy, false); return; }
  const instBtn = e.target.closest('[data-buyinst]');
  if (instBtn) { buyCarFor(instBtn.dataset.buyinst, true); return; }
  const chip = e.target.closest('[data-rid]');
  if (chip) { const r = sim.getResident(Number(chip.dataset.rid)); if (r) { select(r.id); openProfile(r.id); } }
});

$('buildScroll').addEventListener('click', e => {
  const buildBtn = e.target.closest('[data-build]');
  if (buildBtn) buildHere(buildBtn.dataset.build);
});

/* keep the save fresh */
setInterval(() => { if (sim.started && !document.hidden) saveGame(false); }, 15000);
window.addEventListener('beforeunload', () => { if (sim.started) saveGame(false); });
if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.hidden && sim.started) saveGame(false); });

/* cold start: resume an existing town if there is one */
if (hasSave()) {
  if (loadGame()) {
    sim.onToast('استكملت الحارة اللي سبتها 💾');
  } else {
    $('resumeBtn').hidden = false;
  }
} else {
  $('resumeBtn').hidden = true;
}

/* ------------------------------------------------------------
   loop
   ------------------------------------------------------------ */
let lastT = performance.now();
let lastHud = 0, lastCard = 0, lastPeople = 0, lastTown = 0;

function frame(now) {
  const dt = Math.min(0.06, (now - lastT) / 1000);
  lastT = now;

  sim.update(dt);
  draw(now);

  if (now - lastHud > 220) { lastHud = now; syncHud(); }
  if (now - lastCard > 200) { lastCard = now; if (selectedId) updateCard(); }
  if (now - lastPeople > 750) { lastPeople = now; renderPeople(false); }
  if (now - lastTown > 900) {
    lastTown = now;
    if (!$('townBody').hidden) renderTown();
    if (!$('buildBody').hidden) renderBuild();
    if (!$('streetBody').hidden) renderStreet();
    if (nightBtn) {
      const awakeNow = sim.residents.length ? sim.awakeList().length : 0;
      const allAsleep = sim.residents.length > 0 && awakeNow === 0;
      nightBtn.textContent = allAsleep ? '🌙 نم لحد الصبح' : `🌙 ${ar(sim.residents.length - awakeNow)}/${ar(sim.residents.length)} نايمين`;
      nightBtn.classList.toggle('ready', allAsleep);
    }
    if (placeId) updatePlaceCard();
  }
  if (insideId) {
    const p = sim.getPlace(insideId);
    if ($('insideName').textContent !== (p ? p.name : '')) { if (p) $('insideName').textContent = p.name; }
    if (p && sim.foodPlace(p)) $('insideSub').textContent = sim.shopStatus(p).label;
  }

  requestAnimationFrame(frame);
}

resize();
syncHud();
requestAnimationFrame(frame);

/* handy for debugging in the console */
window.__harat = { sim, cam, select, openProfile, selectPlace, enterPlace, exitPlace, buildHere, renderBuild, saveGame, loadGame, updatePlaceCard, setTab, renderStreet, skipToMorning, buyCarFor };
