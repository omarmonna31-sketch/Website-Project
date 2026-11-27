/* ============================================================
   حياة الحارات — rendering + interface
   ============================================================ */
import { Sim, WORLD, ar, timeLabel, money, KINDS, tod, PLACE_DEFS } from './sim.js';

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
  for (const sx of [300, 940]) {
    ctx.strokeStyle = 'rgba(60,48,34,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 34, 360);
    ctx.quadraticCurveTo(sx, 414, sx + 34, 460);
    ctx.stroke();
    for (let i = 1; i < 7; i++) {
      const k = i / 7;
      const x = (1 - k) * (1 - k) * (sx - 34) + 2 * (1 - k) * k * sx + k * k * (sx + 34);
      const y = (1 - k) * (1 - k) * 360 + 2 * (1 - k) * k * 414 + k * k * 460;
      const on = night > 0.2;
      ctx.fillStyle = on ? 'rgba(255,206,116,.95)' : 'rgba(238,225,192,.7)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(255,196,96,.18)';
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* two cars crawling down the main street */
  const span = WORLD.w + 280;
  const carAX = ((sim.minute * 1.5) % span) - 140;
  const carBX = span - ((sim.minute * 1.15 + 760) % span) - 140;
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

function drawCar(x, y, dir, color, night) {
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

  /* cairo taxi checker */
  ctx.fillStyle = 'rgba(40,32,24,.75)';
  ctx.fillRect(-18, 0, 36, 2.4);
  ctx.fillStyle = 'rgba(250,246,232,.85)';
  for (let i = 0; i < 6; i++) ctx.fillRect(-18 + i * 6 + 3, 0, 3, 2.4);

  /* roof sign */
  ctx.fillStyle = '#e3c277';
  rr(-5, -18, 10, 4, 1.5); ctx.fill();

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

  const g = ctx.createLinearGradient(0, y + h - dh, 0, y + h);
  if (isMetal) { g.addColorStop(0, '#7d94a3'); g.addColorStop(1, '#546b7a'); }
  else { g.addColorStop(0, '#95623a'); g.addColorStop(1, '#6e4526'); }
  ctx.fillStyle = g;
  rr(dx - dw / 2, y + h - dh, dw, dh, 5); ctx.fill();
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
function drawAgent(r, now, night) {
  const t = now / 1000;
  const dim = clamp((night || 0) * 0.55, 0, 0.34);
  const walking = r.phase === 'walk';
  const ph = t * 9 + r.id * 1.7;
  const swing = walking ? Math.sin(ph) : 0;
  const bob = walking ? Math.abs(Math.sin(ph)) * 1.3 : Math.sin(t * 1.8 + r.id) * 0.5;

  const spawnK = r.spawnAt ? clamp((now - r.spawnAt) / 500, 0, 1) : 1;
  if (spawnK <= 0) return;
  const sc = 0.6 + 0.4 * (1 - Math.pow(1 - spawnK, 2));

  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(sc * 1.14, sc * 1.14);

  /* shadow */
  ctx.fillStyle = 'rgba(68,48,24,.24)';
  ctx.beginPath(); ctx.ellipse(0, 1.5, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();

  if (r.id === selectedId) {
    ctx.strokeStyle = 'rgba(240,196,102,.9)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(0, 1.5, 12.5, 5.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  } else if (r.id === hoverId) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 1.5, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
  }

  const baseY = -bob;

  /* legs */
  ctx.strokeStyle = '#463d32';
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.4, baseY - 8);
  ctx.lineTo(-2.4 + swing * 2.6, -0.4);
  ctx.moveTo(2.4, baseY - 8);
  ctx.lineTo(2.4 - swing * 2.6, -0.4);
  ctx.stroke();

  /* body */
  const bg = ctx.createLinearGradient(0, baseY - 20, 0, baseY - 6);
  bg.addColorStop(0, shade(r.color, 0.14 - dim));
  bg.addColorStop(1, shade(r.color, -0.12 - dim));
  ctx.fillStyle = bg;
  rr(-5.4, baseY - 19.5, 10.8, 12.4, 3.8); ctx.fill();
  ctx.strokeStyle = 'rgba(45,32,18,.35)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  /* arms */
  ctx.strokeStyle = shade(r.color, -0.18 - dim);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, baseY - 17);
  ctx.lineTo(-5.6 - swing * 1.4, baseY - 10);
  ctx.moveTo(5, baseY - 17);
  ctx.lineTo(5.6 + swing * 1.4, baseY - 10);
  ctx.stroke();

  /* head */
  ctx.fillStyle = shade(r.skin, -dim * 0.8);
  ctx.beginPath(); ctx.arc(0, baseY - 24.5, 4.9, 0, Math.PI * 2); ctx.fill();

  if (r.gender === 'f') {
    ctx.fillStyle = shade(r.color, -0.35);
    ctx.beginPath();
    ctx.arc(0, baseY - 24.5, 5.5, Math.PI * 0.98, Math.PI * 2.02);
    ctx.lineTo(4.7, baseY - 18.5);
    ctx.lineTo(-4.7, baseY - 18.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = r.hair;
    ctx.beginPath();
    ctx.arc(0, baseY - 25.4, 4.9, Math.PI * 1.02, Math.PI * 2.02);
    ctx.fill();
  }

  /* face */
  ctx.fillStyle = 'rgba(45,32,22,.75)';
  ctx.beginPath();
  ctx.arc(-1.6, baseY - 24.6, 0.62, 0, Math.PI * 2);
  ctx.arc(1.6, baseY - 24.6, 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function measureBubble(text) {
  const maxW = 148;
  const font = '600 10.5px Cairo, sans-serif';
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
  const bh = lines.length * 15 + 10;
  return { lines, w: bw, h: bh, font };
}

function paintBubble(layout, cx, by) {
  const bw = layout.w, bh = layout.h;
  const bx = cx - bw / 2;

  ctx.fillStyle = 'rgba(251,244,226,.97)';
  ctx.strokeStyle = 'rgba(59,46,33,.85)';
  ctx.lineWidth = 1;
  rr(bx, by, bw, bh, 8);
  ctx.fill(); ctx.stroke();
  /* tail */
  ctx.fillStyle = 'rgba(251,244,226,.97)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh - 0.6);
  ctx.lineTo(cx + 4, by + bh - 0.6);
  ctx.lineTo(cx, by + bh + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(59,46,33,.85)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx + 4, by + bh);
  ctx.stroke();

  ctx.fillStyle = '#3b2e21';
  ctx.font = layout.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  layout.lines.forEach((l, i) => ctx.fillText(l, cx, by + 6 + i * 15));
}

function drawBubbles(now) {
  let shown = 0;
  const placed = [];
  const hits = (a) => placed.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);

  for (const r of sim.residents) {
    const isSel = r.id === selectedId;
    const isHover = r.id === hoverId;
    if (!r.thought) continue;
    if (r._lastThought !== r.thought) {
      r._lastThought = r.thought;
      r._bubbleAt = now;
    }
    const fresh = now - (r._bubbleAt || 0) < 4600;
    const force = isSel || isHover;
    if (!force) {
      if (!showBubbles || !fresh) continue;
      if (shown >= 4) continue;
    }

    const layout = measureBubble(r.thought);
    const cx = clamp(r.x, layout.w / 2 + 8, WORLD.w - layout.w / 2 - 8);
    let by = r.y - 38 - layout.h;
    let box = { x: cx - layout.w / 2, y: by, w: layout.w, h: layout.h };
    let tries = 0;
    while (hits(box) && tries < 4) { by -= layout.h + 7; box = { x: box.x, y: by, w: box.w, h: box.h }; tries++; }
    if (tries >= 4 && hits(box) && !force) continue;
    if (by < 4) by = 4;
    box.y = by;
    placed.push(box);
    paintBubble(layout, cx, by);
    shown++;
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

  worldTransform();
  const night = darkness(sim.minute);
  drawGround(now);
  drawRoads(now);
  drawStreetLife(now / 1000, night);

  const sorted = sim.places.slice().sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const p of sorted) drawPlace(p, now, night);

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

  /* people stay readable above the night tint */
  worldTransform();
  sim.residents.slice().sort((a, b) => a.y - b.y).forEach(r => drawAgent(r, now, night));

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
  event: e => ['event', 'system'].includes(e.kind),
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
  wander: 'بيتمشى',
};

function actionText(r) {
  if (!r.task) return r.phase === 'walk' ? 'ماشي في الشارع' : 'واقف بيفكر في حاله';
  const place = sim.getPlace(r.task.placeId);
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
  $('rcAction').innerHTML = `<b>دلوقتي:</b> ${esc(actionText(r))}`;
  $('rcThought').innerHTML = `<span>💭</span><span>${r.thought ? esc(r.thought) : 'ساكت… بيفكر.'}</span>`;
}

function renderPeople(force) {
  if ($('peopleBody').hidden && !force) return;
  if (!sim.residents.length) {
    peopleList.innerHTML = '<div class="log-empty">لسه مفيش سكان في الحارة.<br>استدعِ الحارة الأول.</div>';
    return;
  }
  const rows = sim.residents.map(r => {
    const job = r.jobTitle ? esc(r.jobTitle) : 'عاطل';
    return `<div class="person ${r.id === selectedId ? 'sel' : ''}" data-id="${r.id}">
      <div class="avatar" style="background:${r.color}">${esc(r.name.slice(0, 1))}</div>
      <div>
        <div class="p-name">${esc(r.name)}<span class="gtag">${r.gender === 'f' ? '♀' : '♂'} ${ar(r.age)}</span></div>
        <div class="p-sub"><span>${job}</span><span>•</span><span>${esc(homeName(r))}</span>
          <span class="mooddot" style="background:${moodColor(r.mood)}"></span></div>
      </div>
      <div class="p-money">${ar(Math.round(r.money))}<small>جنيه</small></div>
    </div>`;
  }).join('');
  peopleList.innerHTML = rows;
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
   events / controls
   ------------------------------------------------------------ */
$('startBtn').addEventListener('click', () => {
  $('intro').hidden = true;
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
  sim.reset();
  uiLogs = [];
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
    $('logBody').hidden = tab !== 'log';
    $('peopleBody').hidden = tab !== 'people';
    $('townBody').hidden = tab !== 'town';
    $('filters').style.display = tab === 'log' ? 'flex' : 'none';
    if (tab === 'people') renderPeople(true);
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
  const row = e.target.closest('.person[data-id]');
  if (!row) return;
  select(Number(row.dataset.id));
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
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitResident(w.x, w.y);
    select(hit ? hit.id : null);
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
  else if (e.key === 'Escape') select(null);
});

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
  if (now - lastTown > 900) { lastTown = now; if (!$('townBody').hidden) renderTown(); }

  requestAnimationFrame(frame);
}

resize();
syncHud();
requestAnimationFrame(frame);

/* handy for debugging in the console */
window.__harat = { sim, cam, select };
