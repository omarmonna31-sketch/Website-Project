/* ============================================================
   حياة الحارات — Simulation core
   Pure logic (no DOM). Every resident is an autonomous agent:
   it wakes, works, earns, eats, pays rent & bills, socialises,
   sleeps — and narrates what it is thinking the whole time.
   ============================================================ */

export const WORLD = { w: 1240, h: 820 };
/* one in-game day = 120 real seconds at 1× */
export const SIM_MIN_PER_SEC = 12;
export const WALK_PX_PER_SEC = 135;

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export const ar = n => String(n).replace(/[0-9]/g, d => AR[+d]);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
export const tod = m => ((m % 1440) + 1440) % 1440;
export const dayNum = m => Math.floor(m / 1440) + 1;

export function timeLabel(m) {
  const t = tod(m);
  const h = Math.floor(t / 60);
  const mi = Math.floor(t % 60);
  const suffix = h < 12 ? 'ص' : 'م';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${ar(String(h12).padStart(2, '0'))}:${ar(String(mi).padStart(2, '0'))} ${suffix}`;
}
export const money = n => `${ar(Math.round(n))} ج.م`;

function nextAt(m, hour, min = 0) {
  const cur = tod(m);
  const target = hour * 60 + min;
  let d = target - cur;
  if (d <= 0) d += 1440;
  return m + d;
}

/* ------------------------------------------------------------
   Log kinds (icon + colour used by the UI)
   ------------------------------------------------------------ */
export const KINDS = {
  system: { icon: '✦', label: 'الحارة', color: '#8a7358' },
  event: { icon: '⚡', label: 'أحداث', color: '#b4552d' },
  work: { icon: '💼', label: 'شغل', color: '#2f7d74' },
  money: { icon: '💰', label: 'فلوس', color: '#c08a1e' },
  think: { icon: '💭', label: 'خواطر', color: '#7c6ba6' },
  food: { icon: '🍞', label: 'أكل', color: '#bf6a35' },
  home: { icon: '🏠', label: 'بيت', color: '#5570a8' },
  social: { icon: '🗣️', label: 'حياة', color: '#4f8a58' },
  talk: { icon: '💬', label: 'كلام', color: '#3f8f8a' },
};

/* ------------------------------------------------------------
   The neighbourhood
   ------------------------------------------------------------ */
export const PLACE_DEFS = [
  /* ---- شمال غرب ---- */
  { id: 'nour', name: 'عمارة النور', style: 'apartment', kind: 'home', x: 55, y: 55, w: 145, h: 118, color: '#d9b78c', flats: 3, rent: 300 },
  { id: 'baqala', name: 'بقالة عم صابر', style: 'shop', kind: 'work', x: 218, y: 55, w: 145, h: 100, color: '#c98b5e',
    jobs: [{ title: 'بقال', wage: 150, start: 480, end: 960 }] },
  { id: 'bakery', name: 'مخبز الحارة', style: 'bakery', kind: 'food', x: 381, y: 55, w: 150, h: 100, color: '#d6a86a',
    jobs: [{ title: 'خباز', wage: 160, start: 300, end: 720 }],
    meal: { name: 'عيش طازة وجبنة', cost: 9, hunger: 38 } },
  { id: 'hana', name: 'عمارة الهنا', style: 'apartment', kind: 'home', x: 55, y: 207, w: 165, h: 113, color: '#cfa87f', flats: 3, rent: 260 },
  { id: 'qahwa', name: 'قهوة البلد', style: 'cafe', kind: 'social', x: 238, y: 207, w: 140, h: 113, color: '#b98a63',
    jobs: [{ title: 'صبي قهوة', wage: 130, start: 540, end: 1080 }],
    meal: { name: 'شاي وقهوة', cost: 8, hunger: 10 } },
  { id: 'koshk', name: 'كشك عم رامي', style: 'kiosk', kind: 'food', x: 396, y: 217, w: 88, h: 103, color: '#c2733f',
    meal: { name: 'ساندوتش وكولا', cost: 16, hunger: 32 } },

  /* ---- شمال شرق ---- */
  { id: 'workshop', name: 'ورشة الأسطى رجب', style: 'workshop', kind: 'work', x: 710, y: 55, w: 150, h: 110, color: '#a9865c',
    jobs: [{ title: 'نجار', wage: 200, start: 540, end: 1020 }, { title: 'كهربائي', wage: 210, start: 600, end: 1080 }] },
  { id: 'gov', name: 'مصلحة الشهر العقاري', style: 'office', kind: 'work', x: 877, y: 55, w: 150, h: 110, color: '#c9c0a6',
    jobs: [{ title: 'موظف', wage: 170, start: 540, end: 900 }] },
  { id: 'mobile', name: 'محل موبايلات النور', style: 'shop', kind: 'work', x: 1044, y: 55, w: 141, h: 110, color: '#c29468',
    jobs: [{ title: 'بياع موبايلات', wage: 175, start: 600, end: 1080 }] },
  { id: 'koshary', name: 'كشري أم فتحي', style: 'shop', kind: 'food', x: 710, y: 205, w: 140, h: 115, color: '#c47a4e',
    jobs: [{ title: 'بياع كشري', wage: 140, start: 600, end: 1020 }],
    meal: { name: 'طبق كشري', cost: 30, hunger: 62 } },
  { id: 'pharmacy', name: 'صيدلية الشفاء', style: 'pharmacy', kind: 'work', x: 866, y: 205, w: 115, h: 115, color: '#ded8c6',
    jobs: [{ title: 'صيدلي', wage: 210, start: 540, end: 1020 }] },
  { id: 'mosque', name: 'جامع الحارة', style: 'mosque', kind: 'social', x: 997, y: 205, w: 188, h: 115, color: '#d8c9a8' },

  /* ---- جنوب غرب ---- */
  { id: 'salam', name: 'عمارة السلام', style: 'apartment', kind: 'home', x: 55, y: 490, w: 150, h: 115, color: '#d3ae84', flats: 3, rent: 240 },
  { id: 'super', name: 'سوبر ماركت الأمانة', style: 'shop', kind: 'work', x: 221, y: 490, w: 155, h: 110, color: '#b9885f',
    jobs: [{ title: 'كاشير', wage: 155, start: 480, end: 960 }],
    meal: { name: 'عيش وجبنة', cost: 18, hunger: 36 } },
  { id: 'garage', name: 'موقف التكاتك', style: 'garage', kind: 'work', x: 392, y: 490, w: 138, h: 110, color: '#a8967a' },
  { id: 'veg', name: 'سوق الخضار', style: 'market', kind: 'food', x: 55, y: 630, w: 175, h: 120, color: '#9fae6b',
    jobs: [{ title: 'بياع خضار', wage: 145, start: 360, end: 780 }],
    meal: { name: 'فاكهة وخضار', cost: 12, hunger: 26 } },
  { id: 'charity', name: 'سبيل الخير', style: 'charity', kind: 'charity', x: 250, y: 640, w: 110, h: 110, color: '#cbb894',
    meal: { name: 'لقمة عيش', cost: 0, hunger: 46 } },
  { id: 'laundry', name: 'مغسلة الأمانة', style: 'shop', kind: 'work', x: 380, y: 640, w: 145, h: 110, color: '#c6bcae',
    jobs: [{ title: 'عامل مغسلة', wage: 135, start: 480, end: 1020 }] },

  /* ---- جنوب شرق ---- */
  { id: 'youth', name: 'مركز شباب الحارة', style: 'youth', kind: 'social', x: 710, y: 490, w: 150, h: 115, color: '#b9c0a0',
    jobs: [{ title: 'مدرب كورة', wage: 165, start: 840, end: 1260 }] },
  { id: 'school', name: 'مدرسة الحارة', style: 'school', kind: 'work', x: 875, y: 490, w: 145, h: 115, color: '#d7c69d',
    jobs: [{ title: 'مدرس', wage: 185, start: 480, end: 840 }] },
  { id: 'amal', name: 'عمارة الأمل', style: 'apartment', kind: 'home', x: 1035, y: 490, w: 150, h: 115, color: '#d9b995', flats: 3, rent: 320 },
  { id: 'pitch', name: 'ملعب الحارة', style: 'pitch', kind: 'social', x: 710, y: 650, w: 190, h: 105, color: '#8fa878' },
  { id: 'fater', name: 'فرن الفطير المشلتت', style: 'bakery', kind: 'food', x: 915, y: 640, w: 130, h: 115, color: '#d3a067',
    meal: { name: 'فطير مشلتت', cost: 20, hunger: 48 } },
  { id: 'wafaa', name: 'عمارة الوفاء', style: 'apartment', kind: 'home', x: 1060, y: 640, w: 130, h: 115, color: '#ceb08c', flats: 3, rent: 280 },
];

const PRODUCTS = {
  baqala: [{ name: 'سكر وشاي', price: 22, icon: '🧺' }, { name: 'جبنة وبيض', price: 26, icon: '🥚' }, { name: 'رز ومكرونة', price: 18, icon: '🍚' }],
  bakery: [{ name: 'عيش طازة', price: 8, icon: '🍞' }],
  koshk: [{ name: 'ساندوتش', price: 15, icon: '🥪' }, { name: 'كولا ساقعة', price: 7, icon: '🥤' }],
  koshary: [{ name: 'طبق كشري', price: 30, icon: '🍛' }],
  qahwa: [{ name: 'شاي وقهوة', price: 8, icon: '☕' }],
  super: [{ name: 'حاجات البيت', price: 45, icon: '🛍️' }],
  veg: [{ name: 'خضار وفاكهة', price: 16, icon: '🥕' }],
  fater: [{ name: 'فطير مشلتت', price: 20, icon: '🫓' }],
  pharmacy: [{ name: 'دوا البرد', price: 35, icon: '💊' }],
  mobile: [{ name: 'كفر وشاحن', price: 55, icon: '📱' }],
  laundry: [{ name: 'غسيل هدوم', price: 25, icon: '👕' }],
  workshop: [{ name: 'تصليح حاجة', price: 40, icon: '🔧' }],
  gov: [{ name: 'ورق رسمي', price: 30, icon: '📄' }],
  garage: [{ name: 'تصليح توك توك', price: 35, icon: '🛠️' }],
};

/* ---------- looks ---------- */
const MALE_SHIRTS = ['#e6ddc9', '#cfd8d2', '#c7d0e0', '#e3d3b8', '#d7c7df', '#bac8a9', '#dfc9a8', '#a9c0bd'];
const FEMALE_DRESS = ['#8c4a5a', '#5f6f9c', '#3e7d74', '#a06a92', '#b8862b', '#7c8a3f', '#b4552d', '#4f86a8', '#9a5f70', '#4a7f8c'];
const PANTS = ['#39434f', '#2f2b28', '#3f4a3f', '#4a3f36', '#33405c'];
const HIJABS = ['#e8dcc8', '#c9a0a8', '#a8b8c9', '#d8c9a0', '#b9a0c9', '#a0b9a8', '#e0c0a0', '#8f9bb3'];
const HAIRS2 = ['#2b211c', '#3d2c22', '#1f1a17', '#4a3628', '#5a4a3a'];
const APRONS = ['#f2e9d6', '#dfe8e0', '#e9d9c6'];

const NAME_FIRST_M = ['عبده', 'صابر', 'رجب', 'محروس', 'سيد', 'كريم', 'مصطفى', 'حسن', 'عمرو', 'شعبان', 'فتحي', 'رمضان', 'حمدي', 'جمال', 'أنور', 'سامي', 'طلعت', 'بدر', 'نبيل', 'عاطف', 'ياسر', 'مدحت'];
const NAME_FIRST_F = ['فاطمة', 'زينب', 'هدى', 'سعاد', 'أمينة', 'نادية', 'منى', 'شيماء', 'رحمة', 'سماح', 'هالة', 'إيمان', 'نسرين', 'صفية', 'وفاء', 'بوسي', 'منال', 'أميرة'];
const NAME_LAST = ['الخياط', 'الحداد', 'الصعيدي', 'الشربيني', 'أبو أحمد', 'أبو زيد', 'ابن البلد', 'المعلم', 'الغريب', 'البنا', 'الفلاح', 'الجندي', 'الشامي', 'المنياوي', 'الأسمر'];

const SHIRT_COLORS = ['#2f7d74', '#c0703c', '#5d6fa8', '#a34d5d', '#7c8a3f', '#8a5aa8', '#b8862b', '#3f7b9c', '#9c5340', '#5a8a6d', '#a06a92', '#6b7f4f'];
const SKIN_TONES = ['#c98f63', '#b97a52', '#d9a075', '#a96844', '#e0af85', '#b8845c'];
const HAIR_COLORS = ['#2b211c', '#3d2c22', '#1f1a17', '#4a3628'];

export const RESIDENT_COUNT_CAP = 15;

/* ------------------------------------------------------------
   Navigation grid + A*
   ------------------------------------------------------------ */
const CELL = 20;

function buildNav(places) {
  const cols = Math.ceil(WORLD.w / CELL);
  const rows = Math.ceil(WORLD.h / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (const p of places) {
    if (!p.solid) continue;
    const pad = 5;
    const x0 = p.x - pad, y0 = p.y - pad, x1 = p.x + p.w + pad, y1 = p.y + p.h + pad;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        if (cx > x0 && cx < x1 && cy > y0 && cy < y1) blocked[r * cols + c] = 1;
      }
    }
  }
  return { cols, rows, blocked };
}

function nearestFree(nav, x, y) {
  const c0 = clamp(Math.floor(x / CELL), 0, nav.cols - 1);
  const r0 = clamp(Math.floor(y / CELL), 0, nav.rows - 1);
  if (!nav.blocked[r0 * nav.cols + c0]) return { c: c0, r: r0 };
  for (let rad = 1; rad < 10; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) continue;
        if (!nav.blocked[r * nav.cols + c]) return { c, r };
      }
    }
  }
  return null;
}

function losClear(nav, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / 7));
  for (let i = 1; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * (i / steps);
    const y = a.y + (b.y - a.y) * (i / steps);
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) continue;
    if (nav.blocked[r * nav.cols + c]) return false;
  }
  return true;
}

export function findPath(nav, from, to) {
  const exact = { x: to.x, y: to.y };
  if (!nav) return [exact];
  const s = nearestFree(nav, from.x, from.y);
  const g = nearestFree(nav, to.x, to.y);
  if (!s || !g) return [exact];
  const { cols, rows, blocked } = nav;
  const N = cols * rows;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const inOpen = new Uint8Array(N);
  const closed = new Uint8Array(N);
  const si = s.r * cols + s.c;
  const gi = g.r * cols + g.c;
  const h = i => {
    const c = i % cols, r = (i - c) / cols;
    const dx = Math.abs(c - g.c), dy = Math.abs(r - g.r);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const open = [si];
  gScore[si] = 0;
  inOpen[si] = 1;
  let guard = 0;

  while (open.length && guard++ < 20000) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < open.length; i++) {
      const f = gScore[open[i]] + h(open[i]);
      if (f < best) { best = f; bi = i; }
    }
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === gi) break;
    closed[cur] = 1;
    const cc = cur % cols, cr = (cur - cc) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (blocked[ni] || closed[ni]) continue;
        if (dc && dr && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue;
        const step = (dc && dr) ? Math.SQRT2 : 1;
        const tentative = gScore[cur] + step;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          came[ni] = cur;
          if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
        }
      }
    }
  }

  if (si !== gi && came[gi] === -1) return [exact];
  const cells = [];
  let cur = gi;
  while (cur !== -1 && cells.length < 4000) { cells.push(cur); cur = came[cur]; }
  cells.reverse();
  const pts = cells.map(i => { const c = i % cols, r = (i - c) / cols; return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }; });
  pts.shift();

  /* string-pulling so people walk in natural lines */
  const smooth = [];
  let anchor = { x: from.x, y: from.y };
  const candidates = pts.concat([exact]);
  let i = 0;
  while (i < candidates.length) {
    let j = candidates.length - 1;
    for (; j > i; j--) if (losClear(nav, anchor, candidates[j])) break;
    if (j < i) j = i;
    smooth.push(candidates[j]);
    anchor = candidates[j];
    i = j + 1;
  }
  if (!smooth.length || Math.hypot(smooth[smooth.length - 1].x - exact.x, smooth[smooth.length - 1].y - exact.y) > 1) smooth.push(exact);
  return smooth;
}

/* ------------------------------------------------------------
   Thought pools
   ------------------------------------------------------------ */
const TALK = {
  greet: ['إزيك يا {n}؟', 'صباح الخير يا {n}.', 'عاملة إيه يا {n}؟', 'شفتك من بعيد قلت أسلم عليك.', 'إيه الأخبار يا {n}؟'],
  small: ['الدنيا غالية النهاردة…', 'الشغل تعب، بس الحمد لله.', 'الجو حلو النهاردة يا {n}.', 'عرفت إن سعر الطماطم نزل شوية؟', 'عيالك عاملين إيه؟', 'ربنا يسهّل… كل واحد شايل همه.'],
  friends: ['لو احتجت حاجة قولي، أنا موجود.', 'تعالى نروح المولد مع بعض.', 'قعدتنا دي أحلى حاجة في اليوم.', 'إنت من الناس اللي الواحد بيطمنلهم.', 'خليك فاكر إن بابي مفتوح ليك.'],
  reply: ['الحمد لله، ماشية.', 'أهلاً بيك يا صاحبي.', 'والله الدنيا مشغولة…', 'إنت قولت إيه؟', 'تسلم يا غالي.', 'يلا ربنا يكرم.'],
  argue: ['ما تتكلمش في حاجة مش بتفهم فيها!', 'أنا مش فاضي لكلامك ده.', 'بلاش تقلب المواجع.', 'كل مرة نفس الحكاية معاك.'],
  customer: ['عندك {p}؟', 'إزيك يا {n}، عايز {p}.', 'إيه الجديد النهاردة؟', 'هات لي {p} الله يكرمك.'],
  seller: ['اتفضل، طازة النهاردة.', 'خده يا حاج… ربنا يسهّل.', 'ده أحسن اللي عندي.', 'تحت أمرك يا {n}.'],
};

const T = {
  work: [
    'الشغل ما بيخلصش، بس القرش بيحلى في الإيد.',
    'الأسطى بيقول الشغل كتير النهاردة… ربنا يعين.',
    'لو فضلت شغال كده، ممكن أجمع لشقة صغيرة.',
    'أنا مش بحب الشغل ده، بس بيجيب عيش.',
    'بعد ما أخلص، هعدي على القهوة أشرب حاجة.',
    'إيدي بتوجعني، بس اليومية هتوصل.',
  ],
  sleep: [
    'تعبان… محتاج أنام شوية.',
    'يوم طويل، والنوم راحة.',
    'بكرة يوم جديد، ربنا يسهّل.',
    'أحلامي أحسن من الواقع شوية… يلا، ننام.',
  ],
  hungry: [
    'بطني بتزعق من الجوع.',
    'ريحة الأكل واخدة عقلي.',
    'مش هقدر أكمل كده، لازم أكل.',
    'جنيهين وحبة فول وهبقى تمام.',
  ],
  pay: [
    'لازم أدفع قبل ما الدنيا تتقلب.',
    'الفاتورة جاية، والفلوس بالعافية.',
    'أنت تدفع وتقعد مرتاح… أحسن من وجع الدماغ.',
  ],
  rent: [
    'الإيجار جاي، ولازم ألمّ المبلغ.',
    'صاحب العمارة بيسأل كل شهر… الله يعين.',
    'الشقة بقت غالية، بس مفيش مكان تاني.',
  ],
  broke: [
    'الفلوس خلصت وأنا لسه في نص الشهر.',
    'مفيش جنيه في جيبي… مش عارف أعمل إيه.',
    'لو اليومية النهاردة مشيت، هعدي.',
  ],
  social: [
    'قهوة مع الناس أحلى من قعدة البيت.',
    'الدنيا بسيطة، والضحكة ببلاش.',
    'الحكاية مع أصحابي بتنسيني التعب.',
    'الشارع ده فيه حياة… كل واحد وراه حكاية.',
    'هعدي على الجامع وأرجع البيت مرتاح.',
  ],
  gig: [
    'يومية هنا ويومية هناك… المهم ما نمدش إيدنا لحد.',
    'الشغل الحر تعب، بس أحسن من القعدة.',
    'النهاردة توك توك، بكرة حاجة تانية.',
  ],
  charity: ['النهاردة هاخد لقمة من سبيل الخير… بكرة أحسن.'],
  job: [
    'سامع إن فيه شغل في الورشة… يلا نجرب.',
    'قعدة البيت من غير شغل بتقتل.',
    'محتاج أشتغل أي حاجة، أي حاجة.',
  ],
  family: [
    'هقعد مع العيال شوية… الدنيا بتحلى بيهم.',
    'مراتي بتقولي قاعد كتير برة… يلا نراضيها.',
    'البيت ده هو اللي بيرجعلي روحي.',
    'حكاية العيال في المدرسة النهاردة كانت مضحكة.',
  ],
  idle: [
    'الدنيا ماشية… وأنا ماشي معاها.',
    'الحارة هادية النهاردة.',
    'نفسي أفتح محل صغير وأرتاح من الشغل عند الناس.',
    'شوفت الناس بتمشي… كل واحد مشغول بحاله.',
    'ربنا يكرم ويسهّل.',
  ],
};

const SOCIAL_LINES = {
  mosque: ['صلى ركعتين وبعدها قعد يستريح.', 'قعد في صحن الجامع يقرأ شوية.', 'سلّم على الناس اللي في الجامع.'],
  cafe: ['شرب شاي بالنعناع وقعد يتفرج على الشارع.', 'لعب طاولة مع أصحابه وضحك من قلبه.', 'قعد يحكي مع القهوجي عن الأسعار.'],
  pitch: ['لعب كورة مع عيال الحارة لحد ما تعب.', 'اتفرج على ماتش الحارة وشجع فريقه.', 'جرّى ورا الكورة مع العيال.'],
  youth: ['قعد في مركز الشباب يلعب بلايستيشن.', 'اتكلم مع المدرب عن ماتش الجمعة.', 'شرب حاجة ساقعة في الكانتين.'],
  market: ['فات على السوق يشوف أسعار النهاردة.', 'اشترى خضار وحمّال شاله للبيت.'],
  bakery: ['أكل فطير سخن على الرصيف.', 'شرب شاي باللبن جنب الفرن.', 'اشترى عيش سخن للبيت.'],
  kiosk: ['شرب حاجة ساقعة وقعد على الكشك.', 'اتكلم مع عم رامي على ماتش امبارح.'],
  pharmacy: ['دخل الصيدلية يجيب دوا للسخونية.', 'سأل الصيدلي على فيتامينات.'],
  office: ['قعد يستنى دوره في المصلحة.', 'اتكلم مع الموظف على الورق.'],
  workshop: ['قعد يتفرج على الأسطى وهو بيشتغل.', 'ساعد في شيلة حاجة ورجع.'],
  school: ['قعد يستنى العيال خارجين من المدرسة.', 'اتكلم مع مدرس ابنه.'],
  garage: ['قعد يتكلم مع سواقين التكاتك.', 'غسل إيده من الزيت.'],
  charity: ['قعد يستنى دوره على السبيل.', 'شكر اللي واقفين على السبيل.'],
  default: ['قعد مع الناس وحكوا على أسعار السوق.', 'ضحكوا على حكايات الحارة.', 'شربوا شاي وسألوا على بعض.', 'اتكلموا في السياسة… وكل واحد شايل همه.'],
};

function pickLine(r, arr) {
  if (!arr || !arr.length) return '';
  let line = pick(arr);
  let guard = 0;
  while (arr.length > 1 && line === r.lastLine && guard++ < 4) line = pick(arr);
  r.lastLine = line;
  return line;
}

function socialLines(place) {
  if (!place) return SOCIAL_LINES.default;
  const byStyle = SOCIAL_LINES[place.style];
  if (byStyle) return byStyle;
  if (place.kind === 'food') return SOCIAL_LINES.market;
  return SOCIAL_LINES.default;
}

/* ------------------------------------------------------------
   Sim
   ------------------------------------------------------------ */
export class Sim {
  constructor() {
    this.onLog = null;
    this.onToast = null;
    this.onFx = null;
    this.reset();
  }

  reset() {
    this.started = false;
    this.paused = false;
    this.speed = 1;
    this.minute = 7 * 60 + 20;
    this.day = 1;
    this.places = [];
    this.residents = [];
    this.logs = [];
    this.seq = 1;
    this.nextRid = 1;
    this.nav = null;
    this.stats = { earned: 0, spent: 0, meals: 0, rent: 0, bills: 0, gigs: 0, hires: 0, sales: 0, salesCount: 0, talks: 0 };
    this.mod = { foodPrice: 1, energyDrain: 1, moodBias: 0, until: 0, name: '' };
    this.powerCut = false;
    this.events = [];
    this.lastEventDay = 0;
    this.eventPending = false;
    this.eventAt = 0;
    this.museAcc = 0;
  }

  /* ---------- helpers ---------- */
  getPlace(id) { return this.places.find(p => p.id === id) || null; }
  getResident(id) { return this.residents.find(r => r.id === id) || null; }
  get t() { return tod(this.minute); }
  get totalMoney() { return this.residents.reduce((s, r) => s + r.money, 0); }
  get employed() { return this.residents.filter(r => r.jobTitle).length; }

  availableJobs() {
    const out = [];
    for (const p of this.places) {
      if (!p.jobs) continue;
      p.jobs.forEach((j, i) => { if (!j.takenBy) out.push({ place: p, job: j, index: i }); });
    }
    return out;
  }

  freeFlats() {
    const out = [];
    for (const p of this.places) {
      if (p.kind !== 'home') continue;
      const used = this.residents.filter(r => r.homeId === p.id).length;
      if (used < p.flats) out.push(p);
    }
    return out;
  }

  /* ---------- logging ---------- */
  addLog(kind, text, r = null) {
    const entry = {
      id: this.seq++,
      day: this.day,
      time: tod(this.minute),
      kind,
      text,
      rid: r ? r.id : null,
      name: r ? r.name : null,
      color: r ? r.color : null,
    };
    this.logs.push(entry);
    if (this.logs.length > 900) this.logs.splice(0, this.logs.length - 900);
    if (this.onLog) this.onLog(entry);
    return entry;
  }

  think(r, text) {
    if (r.thought === text) return;
    r.thought = text;
    r.thoughtAt = this.minute;
    this.addLog('think', text, r);
  }

  toast(text) { if (this.onToast) this.onToast(text); }

  /* ---------- world creation ---------- */
  summonTown() {
    this.places = PLACE_DEFS.map((d, i) => {
      const place = Object.assign({}, d, {
        door: { x: d.x + d.w / 2, y: d.y + d.h + 20 },
        seed: (i * 37 + 11) % 97,
        appear: 0,
        solid: d.style !== 'pitch',
      });
      if (place.jobs) place.jobs = place.jobs.map(j => Object.assign({}, j, { takenBy: null }));
      if (PRODUCTS[place.id]) place.products = PRODUCTS[place.id].map(x => Object.assign({}, x));
      place.counter = !!place.products;
      return place;
    });
    this.nav = buildNav(this.places);
    this.started = true;
    this.minute = 7 * 60 + 20;
    this.day = 1;
    this.addLog('system', 'استدعيت حارة صغيرة في قلب مصر… الشوارع اتفترشت، والناس جاهزة تعيش.');
    this.addLog('system', 'انت الخالق هنا: مش بتلعب، انت بتتفرج على حياتهم.');
    for (let i = 0; i < 4; i++) this.spawnResident();
    this.addLog('event', 'الحارة صحيت… في ناس بتفتح المحلات، وواحد بيجري ورا التوك توك، وست بتنده على عيالها.');
  }

  spawnResident(opts = {}) {
    if (!this.started) return null;
    const homes = this.freeFlats();
    if (!homes.length) {
      this.addLog('system', 'مفيش شقق فاضية في الحارة… لازم حد يسيب شقة الأول.');
      this.toast('مفيش شقق فاضية');
      return null;
    }
    if (this.residents.length >= RESIDENT_COUNT_CAP) {
      this.toast('الحارة مليانة… خليها تعيش شوية');
      return null;
    }

    const gender = opts.gender || (chance(0.48) ? 'm' : 'f');
    let name = opts.name;
    if (!name) {
      for (let k = 0; k < 20; k++) {
        const first = gender === 'm' ? pick(NAME_FIRST_M) : pick(NAME_FIRST_F);
        let last = pick(NAME_LAST);
        if (gender === 'f' && last.startsWith('أبو ')) last = last.replace('أبو ', 'أم ');
        const cand = `${first} ${last}`;
        if (!this.residents.some(x => x.name === cand)) { name = cand; break; }
      }
      if (!name) name = gender === 'm' ? 'ساكن جديد' : 'ساكنة جديدة';
    }

    const home = pick(homes);
    const flatNo = this.residents.filter(r => r.homeId === home.id).length + 1;

    const male = gender === 'm';
    const look = {
      height: rnd(0.94, 1.06),
      build: rnd(0.93, 1.1),
      top: male ? pick(MALE_SHIRTS) : pick(FEMALE_DRESS),
      pants: pick(PANTS),
      galabeya: male ? chance(0.45) : chance(0.55),
      hijab: male ? false : chance(0.72),
      hijabColor: pick(HIJABS),
      hair: pick(HAIRS2),
      hairStyle: male ? pick(['short', 'short', 'bald', 'cap', 'taqiyah']) : 'long',
      beard: male && chance(0.4),
      moustache: male && chance(0.55),
      glasses: chance(0.18),
      shoe: pick(['#3a2f26', '#2b2622', '#4a3b30']),
      bag: chance(0.45) ? pick(['#8a5a32', '#4a5a6a', '#7a4a5a']) : null,
      apron: null,
      skinTone: pick(SKIN_TONES),
    };

    const r = {
      id: this.nextRid++,
      name,
      gender,
      age: rndInt(19, 58),
      color: look.top,
      look,
      skin: look.skinTone,
      hair: look.hair,
      x: home.door.x + rnd(-16, 16),
      y: home.door.y + rnd(-8, 10),
      homeId: home.id,
      flatNo,
      workplaceId: null,
      jobTitle: null,
      jobIndex: -1,
      money: opts.money != null ? opts.money : rndInt(45, 190),
      hunger: rnd(12, 46),
      energy: rnd(62, 98),
      mood: rnd(46, 82),
      thought: '',
      thoughtAt: -999,
      moodAt: -999,
      phase: 'idle',
      task: null,
      path: [],
      until: null,
      spawnAt: 0,
      jitter: { x: rnd(-13, 13), y: rnd(-7, 9) },
      nextMuse: this.minute + rnd(240, 520),
      rentAmount: home.rent,
      rentDue: this.day + rndInt(3, 6),
      rentNotice: 0,
      billAmount: rndInt(85, 145),
      billDue: this.day + rndInt(4, 8),
      billNotice: 0,
      powerCut: false,
      arrivedDay: this.day,
      stats: { earned: 0, spent: 0, meals: 0, shifts: 0, served: 0 },
      nextEvent: this.minute + rnd(200, 500),
      rel: {},
      crushes: [],
      quotes: [],
      speech: '',
      speechAt: -999,
      chatTimer: rnd(5, 14),
      nextShop: this.minute + rnd(90, 260),
      carry: null,
      serveAt: -999,
      lastLine: '',
    };

    /* start out as strangers who recognise each other */
    for (const o of this.residents) {
      const base = rndInt(6, 24);
      r.rel[o.id] = { aff: base, chats: 0, last: -999, friends: 0 };
      o.rel[r.id] = { aff: clamp(base + rndInt(-5, 5), 0, 100), chats: 0, last: -999, friends: 0 };
    }

    this.residents.push(r);

    /* try to find a job on the same day */
    const slots = this.availableJobs();
    if (slots.length) {
      const slot = pick(slots);
      this.hire(r, slot);
    }

    const jobTxt = r.jobTitle ? `اشتغل ${r.jobTitle} في ${this.getPlace(r.workplaceId).name}` : 'نزل يدور على شغل';
    this.addLog('system', `وصل ساكن جديد للحارة: ${r.name} (${ar(r.age)} سنة) — سكن في ${home.name} شقة ${ar(flatNo)}، و${jobTxt}.`, r);
    this.think(r, pick(['حارة جديدة… ربنا يسهّل.', 'الشقة صغيرة، بس دي بداية.', 'أول مرة أسكن في حارة زي دي… يارب تعجبني.']));
    return r;
  }

  hire(r, slot) {
    slot.job.takenBy = r.id;
    r.workplaceId = slot.place.id;
    r.jobTitle = slot.job.title;
    r.jobIndex = slot.index;
    if (/قهوة|كشري|خباز|بياع|كاشير|مغسلة|صيدلي|خضار/.test(slot.job.title)) {
      r.look.apron = pick(APRONS);
    }
    this.stats.hires++;
    this.addLog('work', `اتعيّن ${r.jobTitle} في ${slot.place.name}.`, r);
  }

  /* ---------- shop counters & relationships ---------- */
  workerAt(placeId) {
    return this.residents.find(w => w.workplaceId === placeId && w.task && w.task.kind === 'work' && w.phase === 'act') || null;
  }

  affOf(a, b) {
    return a.rel && a.rel[b.id] ? a.rel[b.id].aff : 0;
  }

  relInit(a, b) {
    if (!a.rel[b.id]) a.rel[b.id] = { aff: 20, chats: 0, last: -999, friends: 0 };
    if (!b.rel[a.id]) b.rel[a.id] = { aff: 20, chats: 0, last: -999, friends: 0 };
  }

  bumpRel(a, b, delta) {
    this.relInit(a, b);
    const A = a.rel[b.id], B = b.rel[a.id];
    A.aff = clamp(A.aff + delta, 0, 100);
    B.aff = clamp(B.aff + delta, 0, 100);
    A.last = B.last = this.minute;
    const level = A.aff >= 75 ? 2 : A.aff >= 45 ? 1 : 0;
    if (level > (A.friends || 0)) {
      A.friends = level; B.friends = level;
      this.addLog('social', level === 2
        ? `${a.name} و${b.name} بقوا أصحاب أوي… مبقاش بينهم كلام.`
        : `${a.name} و${b.name} بقوا أصحاب.`);
    }
  }

  friendsOf(r) {
    return Object.entries(r.rel || {})
      .map(([id, rel]) => ({ person: this.getResident(Number(id)), rel }))
      .filter(x => x.person && x.rel.aff >= 45)
      .sort((x, y) => y.rel.aff - x.rel.aff);
  }

  talkTo(a, b, lineA, lineB) {
    this.addLog('talk', `«${lineA}» — فرد ${b.name}: «${lineB}»`, a);
    const stamp = { day: this.day, time: tod(this.minute) };
    a.quotes.push({ text: lineA, to: b.name, side: 'قال', ...stamp });
    b.quotes.push({ text: lineB, to: a.name, side: 'رد', ...stamp });
    if (a.quotes.length > 24) a.quotes.shift();
    if (b.quotes.length > 24) b.quotes.shift();
    a.speech = lineA; a.speechAt = this.minute;
    b.speech = lineB; b.speechAt = this.minute;
    /* turn to face each other while they talk */
    if (!a.task || a.phase !== 'walk') a.dir = Math.atan2(b.y - a.y, b.x - a.x);
    if (!b.task || b.phase !== 'walk') b.dir = Math.atan2(a.y - b.y, a.x - b.x);
    this.stats.talks++;
    this.bumpRel(a, b, rndInt(3, 7));
    this.fx('talk', (a.x + b.x) / 2, Math.min(a.y, b.y) - 30, '💬');
  }

  fx(type, x, y, text) {
    if (this.onFx) this.onFx({ type, x, y, text, at: this.minute });
  }

  payCounter(customer, task, place, amount, label) {
    const seller = task.serverId ? this.getResident(task.serverId) : null;
    if (!seller || !amount) return;
    const comm = Math.max(2, Math.round(amount * 0.35));
    seller.money += comm;
    seller.stats.earned += comm;
    this.stats.earned += comm;
    seller.stats.served = (seller.stats.served || 0) + 1;
    this.stats.sales += amount;
    this.stats.salesCount++;
    seller.mood = clamp(seller.mood + 2, 0, 100);
    this.addLog('money', `خدم ${customer.name} (${label}) بـ${money(amount)} — حصته ${money(comm)}.`, seller);
    this.fx('sale', place ? place.door.x + 6 : customer.x, place ? place.door.y + 15 : customer.y - 20, `+${money(comm)}`);
    this.bumpRel(customer, seller, 4);
  }

  maybeChat(r) {
    if (!r.task || r.phase !== 'act') return;
    const kinds = ['social', 'family', 'eat', 'wander', 'shop'];
    if (!kinds.includes(r.task.kind)) return;
    let best = null, bd = 70;
    for (const o of this.residents) {
      if (o === r || !o.task || o.phase !== 'act') continue;
      if (!kinds.includes(o.task.kind)) continue;
      const d = Math.hypot(o.x - r.x, o.y - r.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    if (!chance(0.7)) return;

    const aff = this.affOf(r, best);
    const short = best.name.split(' ')[0];

    /* now and then a small argument */
    if (chance(0.05) && aff > 15) {
      const lineA = pick(TALK.argue);
      const lineB = pick(TALK.argue);
      this.addLog('social', `اتكلموا… وخناقة صغيرة بين ${r.name} و${best.name}.`, r);
      r.speech = lineA; r.speechAt = this.minute;
      best.speech = lineB; best.speechAt = this.minute;
      this.bumpRel(r, best, -rndInt(5, 12));
      r.mood = clamp(r.mood - 4, 0, 100);
      best.mood = clamp(best.mood - 3, 0, 100);
      this.relInit(r, best);
      r.rel[best.id].friends = Math.min(r.rel[best.id].friends, 0);
      best.rel[r.id].friends = Math.min(best.rel[r.id].friends, 0);
      this.fx('talk', (r.x + best.x) / 2, Math.min(r.y, best.y) - 30, '💢');
      return;
    }

    const pool = aff >= 45 ? TALK.friends : aff >= 20 ? TALK.small : TALK.greet;
    const lineA = pick(pool).replace('{n}', short);
    const lineB = pick(TALK.reply);
    this.talkTo(r, best, lineA, lineB);

    /* feelings quietly grow */
    if (r.gender !== best.gender && chance(0.14) && this.affOf(r, best) > 30 && !r.crushes.includes(best.id)) {
      r.crushes.push(best.id);
      r.mood = clamp(r.mood + 8, 0, 100);
      this.addLog('event', `${r.name} حاسس إن قلبه مال لـ${best.name}… ومش عارف يقولها.`, r);
      this.think(r, pick(['مش عارف أقولها إزاي…', 'كل ما أشوفه بنسى الكلام.', 'قلبي بيدق بسرعة لما بتيجي.']));
      if (best.crushes.includes(r.id)) {
        r.confessed = r.confessed || {};
        if (!r.confessed[best.id]) {
          r.confessed[best.id] = true;
          r.mood = clamp(r.mood + 10, 0, 100);
          best.mood = clamp(best.mood + 10, 0, 100);
          this.addLog('event', `الحب بقى من الطرفين: ${r.name} و${best.name} اعترفوا لبعض.`, r);
          this.talkTo(r, best,
            pick([`أنا بحبك يا ${short}…`, 'مش عارف أقولها غير كده: أنا بحبك.']),
            pick(['وأنا كمان… من زمان.', 'كنت مستنية الكلمة دي.']));
        }
      }
    }
  }

  /* ---------- actions ---------- */
  pathTo(r, to) {
    return findPath(this.nav, { x: r.x, y: r.y }, to);
  }

  goToPlace(r, place, kind, extra = {}) {
    const door = place.door;
    let tx = door.x + r.jitter.x;
    let ty = door.y + r.jitter.y;
    if (kind === 'shop' || kind === 'eat') {
      /* stand at the counter, in a loose line */
      const q = this.residents.filter(o => o !== r && o.task && (o.task.kind === 'shop' || o.task.kind === 'eat') && o.task.placeId === place.id).length;
      tx = door.x - 30 - q * 13;
      ty = door.y + 20 + (q % 2) * 4;
    } else if (kind === 'social' || kind === 'family') {
      /* little huddle, not all stacked on the door */
      const q = this.residents.filter(o => o !== r && o.task && o.task.placeId === place.id && ['social', 'family'].includes(o.task.kind)).length;
      const slots = [[-46, 22], [-66, 26], [34, 22], [54, 27], [-30, 34], [20, 35]];
      const slot = slots[q % slots.length];
      tx = door.x + slot[0];
      ty = door.y + slot[1];
    }
    if (kind === 'work' && place.counter) {
      tx = door.x + 7;
      ty = door.y + 1;
    }
    const target = { x: clamp(tx, 10, WORLD.w - 10), y: clamp(ty, 10, WORLD.h - 10) };
    r.task = Object.assign({ kind, placeId: place.id, duration: 30 }, extra);
    r.phase = 'walk';
    r.until = null;
    r.path = this.pathTo(r, target);
    if (extra.thought && chance(0.7)) this.think(r, extra.thought);
    if (!extra.silent) {
      const verbs = {
        work: `رايح الشغل في ${place.name}.`,
        eat: `رايح ياكل في ${place.name}.`,
        sleep: `رايح البيت ينام.`,
        bills: `رايح يدفع فاتورة النور والمايه.`,
        rent: `رايح يدفع إيجار الشقة.`,
        gig: `نازل يدور على يومية في ${place.name}.`,
        social: `نازل ${place.name} يقعد مع الناس.`,
        jobSearch: `رايح ${place.name} يسأل على شغل.`,
        wander: `بيتمشى ناحية ${place.name}.`,
      };
      if (verbs[kind]) this.addLog(kind === 'jobSearch' ? 'work' : kind, verbs[kind], r);
    }
    return true;
  }

  arrive(r) {
    const task = r.task;
    if (!task) return;
    const place = this.getPlace(task.placeId);
    r.phase = 'act';
    let duration = task.duration || 30;
    if (task.kind === 'work' && place && r.jobIndex >= 0) {
      const job = place.jobs[r.jobIndex];
      duration = Math.max(18, job.end - this.t);
      task.workStart = this.minute;
    }
    r.until = this.minute + duration;

    if (task.kind === 'jobSearch' && place) {
      const slot = this.availableJobs().find(s => s.place.id === place.id);
      if (slot && chance(0.7)) {
        this.hire(r, slot);
        this.think(r, `الحمد لله… اتوضفت ${slot.job.title} في ${place.name}.`);
        r.task = null;
        r.phase = 'idle';
        r.until = null;
        return;
      }
      this.addLog('work', `سأل على شغل في ${place.name}… مفيش مكان دلوقتي.`, r);
      this.think(r, pick(['مفيش شغل هنا… يلا نجرب مكان تاني.', 'كل ما أروح مكان يقولولي تعالى بكرة.']));
    }

    if (task.kind === 'work' && place) {
      this.addLog('work', `بدأ شغله النهاردة (${r.jobTitle || 'شغل'}) في ${place.name}.`, r);
    }
    if ((task.kind === 'eat' || task.kind === 'shop') && place) {
      const server = this.workerAt(place.id);
      if (server && server.id !== r.id) {
        task.serverId = server.id;
        const order = task.kind === 'shop' ? (task.product ? task.product.name : 'حاجة') : (place.meal ? place.meal.name : 'طلب');
        task.orderName = order;
        const qlen = this.residents.filter(o => o !== r && o.task && o.task.kind === task.kind && o.task.placeId === place.id && o.phase === 'act').length;
        if (qlen > 0) this.think(r, pick(['الطابور طويل النهاردة…', 'دوري جاي، أستنى شوية.', 'الدنيا زحمة… الصبر.']));
        if (chance(0.65)) {
          this.addLog('work', `جاله زبون: ${r.name} عايز ${order}.`, server);
          this.think(server, pick(['الزبون ده محترم…', 'الشغل ماشي النهاردة.', 'يلا نخدم الراجل.']));
        }
        this.fx('queue', place.door.x - 26, place.door.y + 18, '🧍');
        task.serverId = server.id;
      }
    }
    if (task.kind === 'eat' && place) {
      this.addLog('food', `قعد ياكل ${place.meal ? place.meal.name : 'حاجة سريعة'} في ${place.name}.`, r);
    }
    if (task.kind === 'sleep') {
      this.addLog('home', 'رجع البيت، قفل الباب، ونام.', r);
    }
    if (task.kind === 'social' && place && chance(0.5)) {
      this.addLog('social', pickLine(r, socialLines(place)), r);
    }
    if (task.kind === 'family' && chance(0.7)) {
      this.addLog('home', pickLine(r, [
        'رجع البيت وقعد مع عياله على العشاء.',
        'قعد مع مراته بيتكلموا في مصاريف الشهر.',
        'لعب مع ابنه شوية قبل ما ينام.',
        'اتفرجوا على التليفزيون مع بعض.',
      ]), r);
    }
    if (task.kind === 'bills') this.addLog('money', 'واقف يدفع فاتورة النور والمايه.', r);
    if (task.kind === 'rent') this.addLog('money', 'واقف يدفع إيجار الشقة.', r);
  }

  finish(r) {
    const task = r.task;
    const place = task ? this.getPlace(task.placeId) : null;
    r.task = null;
    r.phase = 'idle';
    r.until = null;
    if (!task) return;

    switch (task.kind) {
      case 'work': {
        const full = task.wage || 0;
        let ratio = 1;
        if (task.shiftLen && task.workStart != null) {
          const worked = Math.max(0, this.minute - task.workStart);
          ratio = clamp(worked / task.shiftLen, 0.45, 1);
        }
        const wage = Math.round(full * ratio);
        r.money += wage;
        r.stats.earned += wage;
        r.stats.shifts++;
        this.stats.earned += wage;
        r.mood = clamp(r.mood + (ratio > 0.85 ? 3 : -1), 0, 100);
        this.addLog('money', `استلم يومية النهاردة (${r.jobTitle || 'شغل'}): ${money(wage)}.`, r);
        if (ratio < 0.8) {
          this.think(r, pick(['اليومية ناقصة النهاردة… وصلت متأخر.', 'لو وصلت بدري، كنت خدت اليومية كاملة.']));
        } else {
          this.think(r, pick(['الحمد لله، اليومية وصلت.', `معايا ${money(r.money)}… أحسن من امبارح.`, 'يومية النهاردة تمام… يلا نصرف بحساب.']));
        }
        break;
      }
      case 'sleep': {
        r.carry = null;
        r.energy = clamp(r.energy + 14, 0, 100);
        r.mood = clamp(r.mood + 2, 0, 100);
        this.addLog('home', 'صحى من النوم، غسل وشه، وشرب شاي.', r);
        break;
      }
      case 'eat': {
        const meal = task.meal || { name: 'حاجة سريعة', cost: 15, hunger: 30 };
        if (task.paid) {
          r.money -= 0;    // charity meal
          r.mood = clamp(r.mood - 3, 0, 100);
          this.addLog('food', `أكل ${meal.name} في ${place ? place.name : 'سبيل الخير'}… من غير فلوس.`, r);
          this.think(r, pick(T.charity));
        } else {
          const cost = Math.round(meal.cost * (this.mod.foodPrice || 1));
          r.money -= cost;
          r.stats.spent += cost;
          this.stats.spent += cost;
          r.hunger = clamp(r.hunger - meal.hunger, 0, 100);
          r.mood = clamp(r.mood + 6, 0, 100);
          this.stats.meals++;
          r.stats.meals++;
          this.addLog('money', `دفع ${money(cost)} على ${meal.name}.`, r);
          this.think(r, pick(['شبعت… الحمد لله.', 'الأكل هنا طعمه زي البيت.', 'القرش بيطير بسرعة…']));
          this.payCounter(r, task, place, cost, meal.name);
          if (task.serverId) {
            const cook = this.getResident(task.serverId);
            if (cook && chance(0.5)) {
              this.talkTo(r, cook,
                pick(TALK.customer).replace('{p}', meal.name).replace('{n}', cook.name.split(' ')[0]),
                pick(TALK.seller).replace('{n}', r.name.split(' ')[0]));
            }
          }
        }
        break;
      }
      case 'bills': {
        const amount = task.amount;
        r.money -= amount;
        r.stats.spent += amount;
        this.stats.spent += amount;
        this.stats.bills += amount;
        r.billAmount = rndInt(85, 150);
        r.billDue = this.day + 7;
        r.billNotice = 0;
        r.powerCut = false;
        r.mood = clamp(r.mood + 5, 0, 100);
        this.addLog('money', `دفع فاتورة النور والمايه ${money(amount)}… ارتاح من القلق.`, r);
        this.think(r, pick(['دفعت الفاتورة… باقي الإيجار.', 'نور ومايه… وباقي الشهر طويل.']));
        break;
      }
      case 'rent': {
        const amount = task.amount;
        r.money -= amount;
        r.stats.spent += amount;
        this.stats.spent += amount;
        this.stats.rent += amount;
        r.rentDue = this.day + 7;
        r.rentNotice = 0;
        r.mood = clamp(r.mood + 6, 0, 100);
        this.addLog('money', `دفع إيجار الشقة في ${place ? place.name : 'العمارة'}: ${money(amount)}.`, r);
        this.think(r, pick(['الإيجار اتسدد… ربنا يكرم.', 'مرت الشهر… يلا نلمّ اللي جاي.']));
        break;
      }
      case 'gig': {
        const earn = task.earn || 60;
        r.money += earn;
        r.stats.earned += earn;
        this.stats.earned += earn;
        this.stats.gigs++;
        r.mood = clamp(r.mood - 2, 0, 100);
        this.addLog('money', `خلص يومية في ${place ? place.name : 'الشارع'} وقبض ${money(earn)}.`, r);
        this.think(r, pick(['كل قرش بشقاه… بس الحمد لله.', 'اليومية مشيت النهاردة.', 'لو الشغل ده ثابت، كنت ارتحت.']));
        break;
      }
      case 'shop': {
        const price = task.price || 0;
        const product = task.product || { name: 'حاجة', icon: '🛍️' };
        if (r.money < price) {
          this.addLog('money', `دخل ${place ? place.name : 'المحل'} وشاف السعر… ورجع من غير ما يشتري.`, r);
          this.think(r, pick(['السعر غالي عليّا…', 'هستنى لحد ما الفلوس تتحسن.']));
          r.mood = clamp(r.mood - 3, 0, 100);
          break;
        }
        r.money -= price;
        r.stats.spent += price;
        this.stats.spent += price;
        this.stats.sales += price;
        this.stats.salesCount++;
        r.carry = product.icon;
        r.mood = clamp(r.mood + 3, 0, 100);
        const seller = task.serverId ? this.getResident(task.serverId) : null;
        this.addLog('money', `اشترى ${product.name} من ${place ? place.name : 'المحل'} بـ${money(price)}.`, r);
        if (seller) {
          const comm = Math.max(2, Math.round(price * 0.35));
          seller.money += comm;
          seller.stats.earned += comm;
          this.stats.earned += comm;
          seller.mood = clamp(seller.mood + 2, 0, 100);
          this.addLog('money', `باع ${product.name} لـ${r.name} بـ${money(price)} — حصته ${money(comm)}.`, seller);
          this.fx('sale', (place ? place.door.x : r.x) + 6, (place ? place.door.y : r.y) + 15, `+${money(comm)}`);
          this.bumpRel(r, seller, 4);
          if (chance(0.5)) {
            this.talkTo(r, seller,
              pick(TALK.customer).replace('{p}', product.name).replace('{n}', seller.name.split(' ')[0]),
              pick(TALK.seller).replace('{n}', r.name.split(' ')[0]));
          }
        }
        this.think(r, pick(['جبت الحاجة… يلا البيت.', 'باقي حاجات تانية الأسبوع الجاي.', 'كل مرة أطلع من السوق أدفع أكتر.']));
        break;
      }
      case 'social': {
        const cost = task.cost || 0;
        if (cost) {
          r.money -= cost;
          r.stats.spent += cost;
          this.stats.spent += cost;
        }
        r.mood = clamp(r.mood + (task.mood || 7), 0, 100);
        r.hunger = clamp(r.hunger - (task.food || 0), 0, 100);
        if (cost >= 10) this.addLog('money', `دفع ${money(cost)} على قعدة في ${place ? place.name : 'القهوة'}.`, r);
        if (place && chance(0.4)) this.addLog('social', pickLine(r, socialLines(place)), r);
        break;
      }
      case 'family': {
        r.mood = clamp(r.mood + 7, 0, 100);
        r.energy = clamp(r.energy - 4, 0, 100);
        if (chance(0.5)) this.think(r, pick(T.family));
        break;
      }
      case 'wander': break;
      case 'jobSearch': break;
      default: break;
    }
    if (r.money < 0) {
      r.money = 0;
      r.mood = clamp(r.mood - 10, 0, 100);
    }
  }

  /* ---------- decisions ---------- */
  decide(r) {
    const t = this.t;
    const home = this.getPlace(r.homeId);
    const jobPlace = r.workplaceId ? this.getPlace(r.workplaceId) : null;
    const job = jobPlace && r.jobIndex >= 0 ? jobPlace.jobs[r.jobIndex] : null;

    /* 1 — exhaustion / night */
    if (r.energy < 15) {
      return this.goToPlace(r, home, 'sleep', { duration: 240, thought: pick(T.sleep) });
    }
    if ((t >= 22 * 60 || t < 5 * 60) && r.energy < 94) {
      const untilMorning = Math.min(480, Math.max(160, nextAt(this.minute, 6, 30) - this.minute));
      return this.goToPlace(r, home, 'sleep', { duration: untilMorning, thought: pick(T.sleep), silent: true });
    }

    /* 2 — work shift */
    if (job) {
      const inShift = t >= job.start - 30 && t <= job.end - 12;
      if (inShift) {
        const dur = Math.max(25, job.end - t);
        return this.goToPlace(r, jobPlace, 'work', {
          duration: dur, wage: job.wage, shiftLen: job.end - job.start,
          thought: pick(T.work), silent: true,
        });
      }
    }

    /* 3 — bills, then rent */
    if (r.billAmount > 0 && this.day >= r.billDue && r.money >= r.billAmount) {
      return this.goToPlace(r, home, 'bills', { duration: 18, amount: r.billAmount, thought: pick(T.pay), silent: true });
    }
    if (this.day >= r.rentDue && r.money >= r.rentAmount) {
      return this.goToPlace(r, home, 'rent', { duration: 18, amount: r.rentAmount, thought: pick(T.rent), silent: true });
    }

    /* 4 — food */
    if (r.hunger > 52) return this.eat(r);
    if (!r.jobTitle && !job && this.availableJobs().length && chance(0.55)) return this.searchJob(r);

    /* 5 — money trouble */
    if (r.money < 55) return this.gig(r);

    /* 5b — house errands */
    if (this.minute > r.nextShop && t >= 9 * 60 && t <= 20 * 60 + 30 && r.money > 35) {
      r.nextShop = this.minute + rnd(260, 520);
      if (chance(0.8)) return this.shop(r);
    }

    /* 6 — family time in the evening */
    if (t >= 18 * 60 && t <= 21 * 60 + 30 && chance(0.42)) return this.family(r);

    /* 7 — social life */
    if (t >= 16 * 60 && chance(0.62)) return this.social(r);
    if (chance(0.3)) return this.social(r);
    return this.wander(r);
  }

  eat(r) {
    const foods = this.places.filter(p => p.meal && p.kind !== 'home' && p.kind !== 'charity');
    const affordable = foods.filter(p => {
      const c = Math.round(p.meal.cost * (this.mod.foodPrice || 1));
      return c <= r.money;
    });
    let place;
    let paid = false;
    if (affordable.length) {
      /* prefer something filling, closer if prices tie */
      affordable.sort((a, b) => (b.meal.hunger - b.meal.cost) - (a.meal.hunger - a.meal.cost));
      place = pick(affordable.slice(0, Math.min(3, affordable.length)));
    } else {
      place = this.places.find(p => p.kind === 'charity');
      paid = true;
    }
    if (!place) {
      return this.goToPlace(r, this.getPlace(r.homeId), 'eat', {
        duration: 40, paid: true, meal: { name: 'حاجة في البيت', cost: 0, hunger: 30 },
        thought: 'مفيش فلوس… هدور على حاجة في البيت.',
      });
    }
    const cost = Math.round(place.meal.cost * (this.mod.foodPrice || 1));
    this.addLog('food', paid
      ? `رايح ${place.name}… مش معاه حق الأكل.`
      : `رايح ياكل ${place.meal.name} في ${place.name} (${money(cost)}).`, r);
    return this.goToPlace(r, place, 'eat', {
      duration: rndInt(30, 50),
      meal: place.meal,
      paid,
      thought: paid ? pick(T.charity) : pick(T.hungry),
      silent: true,
    });
  }

  searchJob(r) {
    const slots = this.availableJobs();
    if (!slots.length) return this.wander(r);
    const byPlace = {};
    slots.forEach(s => { byPlace[s.place.id] = s.place; });
    const place = pick(Object.values(byPlace));
    return this.goToPlace(r, place, 'jobSearch', { duration: 25, thought: pick(T.job) });
  }

  gig(r) {
    const spots = this.places.filter(p => ['garage', 'market', 'charity', 'youth', 'veg'].includes(p.id));
    const place = pick(spots.length ? spots : this.places);
    const earn = rndInt(45, 95);
    this.addLog('work', `نزل يدور على يومية في ${place.name}.`, r);
    return this.goToPlace(r, place, 'gig', {
      duration: rndInt(90, 160), earn, thought: pick(T.gig), silent: true,
    });
  }

  social(r) {
    const spots = this.places.filter(p => ['social', 'food'].includes(p.kind) && p.id !== r.workplaceId);
    let place = pick(spots);
    if (chance(0.65)) {
      const counts = new Map();
      for (const o of this.residents) {
        if (o === r || !o.task || !o.task.placeId) continue;
        counts.set(o.task.placeId, (counts.get(o.task.placeId) || 0) + 1);
      }
      let bestId = null, bestN = 0;
      for (const p of spots) {
        const n = counts.get(p.id) || 0;
        if (n > bestN) { bestN = n; bestId = p.id; }
      }
      if (bestId) place = this.getPlace(bestId);
    }
    const isFood = place.meal && place.kind === 'food' && r.money > place.meal.cost;
    const cost = isFood ? Math.round(place.meal.cost * 0.6) : (place.kind === 'social' ? (chance(0.4) ? 8 : 0) : 0);
    if (place.kind === 'social' && chance(0.5)) {
      this.addLog('social', `رايح ${place.name} يقعد شوية مع الناس.`, r);
    }
    return this.goToPlace(r, place, 'social', {
      duration: rndInt(40, 95),
      cost,
      food: isFood ? Math.round(place.meal.hunger * 0.5) : 0,
      mood: rndInt(5, 12),
      thought: pick(T.social),
      silent: true,
    });
  }

  family(r) {
    const home = this.getPlace(r.homeId);
    return this.goToPlace(r, home, 'family', {
      duration: rndInt(60, 120), thought: pick(T.family), silent: true,
    });
  }

  shop(r) {
    const shops = this.places.filter(p => p.products && p.products.length);
    if (!shops.length) return this.wander(r);
    const staffed = shops.filter(p => this.workerAt(p.id));
    const place = pick(staffed.length && chance(0.75) ? staffed : shops);
    const product = pick(place.products);
    const price = Math.round(product.price * (this.mod.foodPrice || 1));
    if (chance(0.45)) this.addLog('social', `نزل ${place.name} يجيب ${product.name}.`, r);
    return this.goToPlace(r, place, 'shop', {
      duration: rndInt(16, 30),
      product,
      price,
      thought: pick(['ناقص حاجات في البيت…', 'هجيب حاجة سريعة وأرجع.', 'الأسعار كل يوم بتغلى.']),
      silent: true,
    });
  }

  wander(r) {
    const place = pick(this.places);
    return this.goToPlace(r, place, 'wander', {
      duration: rndInt(20, 55), thought: pick(T.idle), silent: true,
    });
  }

  /* ---------- per-frame ---------- */
  update(dt) {
    if (!this.started || this.paused) return;
    const real = Math.min(dt, 0.1);
    const simDt = real * SIM_MIN_PER_SEC * this.speed;   /* sim minutes */
    const prevDay = this.day;
    this.minute += simDt;
    this.day = dayNum(this.minute);
    if (this.day !== prevDay) this.newDay();

    if (this.mod.until && this.minute > this.mod.until) {
      this.mod = { foodPrice: 1, energyDrain: 1, moodBias: 0, until: 0, name: '' };
      this.powerCut = false;
    }

    for (const r of this.residents) this.updateResident(r, simDt, real);
  }

  updateResident(r, simDt, real) {
    const sleeping = r.task && r.task.kind === 'sleep' && r.phase === 'act';
    const drain = (this.mod.energyDrain || 1) * (r.powerCut ? 1.15 : 1);

    if (sleeping) {
      r.energy = clamp(r.energy + simDt * 0.155, 0, 100);
    } else {
      r.energy = clamp(r.energy - simDt * 0.046 * drain, 0, 100);
    }
    r.hunger = clamp(r.hunger + simDt * (sleeping ? 0.024 : 0.058), 0, 100);

    /* mood drifts to a neutral middle, then is pushed by events */
    r.mood = clamp(r.mood + (52 - r.mood) * 0.0009 * simDt, 0, 100);
    if (r.hunger > 85 || r.energy < 12) r.mood = clamp(r.mood - simDt * 0.02, 0, 100);

    /* walking */
    if (r.phase === 'walk') {
      const speed = WALK_PX_PER_SEC * this.speed;
      let dist = speed * real;
      let guard = 0;
      while (dist > 0 && r.path.length && guard++ < 50) {
        const tgt = r.path[0];
        const dx = tgt.x - r.x, dy = tgt.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.001) { r.path.shift(); continue; }
        r.dir = Math.atan2(dy, dx);
        if (d <= dist) {
          r.x = tgt.x; r.y = tgt.y; dist -= d; r.path.shift();
        } else {
          r.x += (dx / d) * dist;
          r.y += (dy / d) * dist;
          dist = 0;
        }
      }
      if (!r.path.length) this.arrive(r);
    } else {
      r.dir = r.dir || 0;
    }

    /* activity timer */
    if (r.phase === 'act' && r.until != null && this.minute >= r.until) this.finish(r);
    if (r.phase === 'walk' && r.task) {
      /* if a shift has already ended while walking, give up politely */
      const task = r.task;
      if (task.kind === 'work') {
        const jobPlace = this.getPlace(task.placeId);
        const job = jobPlace && r.jobIndex >= 0 ? jobPlace.jobs[r.jobIndex] : null;
        if (job && this.t > job.end + 30) { r.task = null; r.phase = 'idle'; }
      }
    }

    /* conversations with whoever is standing nearby */
    r.chatTimer -= real;
    if (r.chatTimer <= 0) {
      r.chatTimer = rnd(4, 10);
      if (r.task && r.task.kind !== 'sleep') this.maybeChat(r);
    }

    /* random musings */
    if (this.minute > r.nextMuse) {
      r.nextMuse = this.minute + rnd(300, 620);
      if (!r.task && r.phase === 'idle') {
        const pool = r.money < 40 ? T.broke : !r.jobTitle ? T.job : r.hunger > 70 ? T.hungry : T.idle;
        this.think(r, pick(pool));
      }
    }

    /* decide next action */
    if (!r.task && r.phase === 'idle') this.decide(r);
  }

  /* ---------- day rollover ---------- */
  newDay() {
    this.addLog('system', `بدأ اليوم ${ar(this.day)} في الحارة… ٢٤ ساعة جديدة من الحكايات.`);

    for (const r of this.residents) {
      /* rent due */
      if (this.day >= r.rentDue) {
        if (r.rentNotice !== r.rentDue) {
          r.rentNotice = r.rentDue;
          this.addLog('event', `الإيجار بقى مستحق على ${r.name} (${money(r.rentAmount)}) في ${this.getPlace(r.homeId).name}.`, r);
        }
        if (r.money < r.rentAmount) {
          r.mood = clamp(r.mood - 3, 0, 100);
          if (this.day - r.rentDue === 2) {
            this.addLog('event', `صاحب العمارة خبط باب ${r.name}: «الإيجار يا حاج…» و${r.name} قاله: «يومين وهجيبه».`, r);
          }
          if (this.day - r.rentDue >= 7 && chance(0.5)) {
            this.think(r, 'صاحب العمارة بيتكلم في الطرد… لازم أرتب الفلوس بأي طريقة.');
          }
        }
      }
      /* bills due */
      if (r.billAmount > 0 && this.day >= r.billDue) {
        if (r.billNotice !== r.billDue) {
          r.billNotice = r.billDue;
          this.addLog('event', `فاتورة النور والمايه وصلت لـ${r.name}: ${money(r.billAmount)}.`, r);
        }
        if (this.day >= r.billDue + 3 && !r.powerCut && r.money < r.billAmount) {
          r.powerCut = true;
          r.mood = clamp(r.mood - 8, 0, 100);
          this.addLog('event', `قطعوا النور عن شقة ${r.name}… قعد في الضلمة.`, r);
          this.think(r, 'قعدت في الضلمة… لو معايا الفاتورة كنت دفعت من زمان.');
        }
      }
    }

    /* small daily household spending keeps the economy honest */
    for (const r of this.residents) {
      const spend = rndInt(10, 34);
      if (r.money >= spend) {
        r.money -= spend;
        r.stats.spent += spend;
        this.stats.spent += spend;
        if (chance(0.22)) this.addLog('money', `صرف على مصاريف البيت: ${money(spend)}.`, r);
      }
    }

    if (this.day > this.lastEventDay && chance(0.62)) {
      this.eventPending = true;
      this.eventAt = this.minute + rndInt(7 * 60, 11 * 60);
    }
    this.maybeResidentEvent();
  }

  maybeResidentEvent() {
    if (!this.residents.length) return;
    const r = pick(this.residents);
    const roll = Math.random();
    if (roll < 0.18) {
      const amount = rndInt(20, 70);
      r.money += amount;
      this.addLog('money', `لقى ${money(amount)} في الشارع… «الرزق بيجي من حيث لا تحتسب».`, r);
      this.think(r, 'لقيت فلوس في الشارع… الحمد لله.');
    } else if (roll < 0.3 && r.money > 40) {
      const amount = rndInt(15, 40);
      r.money -= amount;
      this.addLog('money', `جاره استلف ${money(amount)} ووعد يرجّعها أول الشهر.`, r);
    } else if (roll < 0.42) {
      r.mood = clamp(r.mood + 12, 0, 100);
      this.addLog('social', 'عياله زاروه النهاردة… البيت ضحك تاني.', r);
      this.think(r, 'العيال زاروني… الدنيا بقت أحلى.');
    } else if (roll < 0.52) {
      r.mood = clamp(r.mood - 9, 0, 100);
      this.addLog('social', 'اتخانق مع بياع الخضار على كيلو الطماطم… ورجع البيت متنرفز.', r);
    } else if (roll < 0.62 && r.energy < 70) {
      r.mood = clamp(r.mood + 5, 0, 100);
      this.addLog('social', 'قعد على القهوة مع أصحابه لحد الفجر… وضحك من قلبه.', r);
    }
  }

  triggerEvent(id, silent = false) {
    this.lastEventDay = this.day;
    const ev = pick([
      {
        key: 'heat', name: 'موجة حر',
        text: 'موجة حرّ نار النهاردة… الشمس بتحرق الشارع.',
        apply: () => this.setMod({ energyDrain: 1.7, moodBias: -4, name: 'موجة حر', hours: 10 }),
        react: 'الجو حرّ… حتى الهوا واقف.',
      },
      {
        key: 'prices', name: 'غلاء الأسعار',
        text: 'الأسعار طلعت فوق… كيلو الطماطم بقى بحساب تاني.',
        apply: () => this.setMod({ foodPrice: 1.4, moodBias: -3, name: 'غلاء', hours: 30 }),
        react: 'الأسعار بقت نار… الأكل بقى حلم.',
      },
      {
        key: 'prayer', name: 'مولد الحارة',
        text: 'مولد الحارة… الناس كلها نزلت الشارع، وفي حلاوة ومزيكا.',
        apply: () => this.setMod({ moodBias: 9, name: 'مولد الحارة', hours: 12 }),
        react: 'المولد النهاردة… الدنيا كلها فرحانة.',
      },
      {
        key: 'rain', name: 'مطر',
        text: 'نزل مطر خفيف على الحارة… ريحة الطين طلعت في الشارع.',
        apply: () => this.setMod({ energyDrain: 0.9, moodBias: 5, name: 'مطر', hours: 8 }),
        react: 'ريحة المطر حلوة… ربنا يرزقنا.',
      },
      {
        key: 'power', name: 'قطع الكهربا',
        text: 'الكهربا قطعت في الحارة كلها… الشارع بقى ضلمة إلا من لمبة جامع.',
        apply: () => { this.powerCut = true; this.setMod({ moodBias: -5, name: 'قطع الكهربا', hours: 8 }); },
        react: 'الضلمة في كل حتة… يلا، ننزل نقعد على الباب.',
      },
      {
        key: 'support', name: 'دعم',
        text: 'وصلت شنط رمضان من الجمعية… كل بيت خد شنطة.',
        apply: () => {
          this.residents.forEach(r => { r.hunger = clamp(r.hunger - 25, 0, 100); r.mood = clamp(r.mood + 6, 0, 100); });
          this.setMod({ moodBias: 4, name: 'شنط الخير', hours: 6 });
        },
        react: 'شنطة الخير وصلت… الدنيا لسه فيها خير.',
      },
      {
        key: 'eid', name: 'العيد',
        text: 'العيد قرّب… الحارة كلها بتجهز، والعيال بتجري في الشارع.',
        apply: () => {
          this.residents.forEach(r => {
            r.mood = clamp(r.mood + 14, 0, 100);
            if (r.money > 90) { r.money -= 30; r.stats.spent += 30; this.stats.spent += 30; }
          });
          this.setMod({ moodBias: 8, name: 'العيد', hours: 24 });
        },
        react: 'العيد قرّب… لازم أشتري حاجة للعيال.',
      },
    ]);

    if (ev.apply) ev.apply();
    if (silent) return;
    this.addLog('event', ev.text);
    this.events.push({ day: this.day, name: ev.name });
    if (this.events.length > 12) this.events.shift();
    const listeners = this.residents.filter(() => chance(0.5));
    listeners.slice(0, 3).forEach(r => this.think(r, ev.react || ev.text));
    this.toast(ev.name);
  }

  setMod({ foodPrice = 1, energyDrain = 1, moodBias = 0, name = '', hours = 6 }) {
    this.mod = {
      foodPrice, energyDrain, moodBias, name,
      until: this.minute + hours * 60,
    };
  }
}
