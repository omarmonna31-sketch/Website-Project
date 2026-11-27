/* ============================================================
   حياة الحارات — Simulation core
   Pure logic (no DOM). Every resident is an autonomous agent:
   it wakes, works, earns, eats, pays rent & bills, socialises,
   sleeps — and narrates what it is thinking the whole time.
   ============================================================ */

import { DialogueEngine, LINES, jobGroup } from './dialogue.js';
import { TutorialEngine, TUTORIAL_STEPS } from './tutorial.js';
import {
  MAYOR_ROLES, MAYOR_COMMANDS, TAX_LIMITS, COVERAGE_LEVELS, COVERAGE_LABEL,
  SERVICES, GRANT_LIMIT_NEEDS_CONFIRM, FINE_LIMIT, CONFIRM_TTL, freshMayorState,
} from './mayor.js';

export const WORLD = { w: 1240, h: 920 };
/* one in-game day = 120 real seconds at 1× */
/* طول اليوم: ١٢ دقيقة محاكاة/ثانية كانت سريعة — بقى ٩.٦ (يوم أطول بـ٢٥٪)
   القيمة قابلة للتغيير من بره (SIM_MIN_PER_SEC أو sim.setDayLength) */
export const SIM_MIN_PER_SEC = 9.6;
export const DAY_LENGTH_FACTORS = [0.25, 0.5, 1, 1.5, 2, 4];
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
  love: { icon: '❤️', label: 'حب وزواج', color: '#c25b7c' },
  build: { icon: '🏗️', label: 'بناء', color: '#8a7a4a' },
  crime: { icon: '🚨', label: 'جرائم', color: '#a33b31' },
  police: { icon: '🚓', label: 'شرطة', color: '#3a6ea5' },
  ride: { icon: '🚕', label: 'مشاوير', color: '#b0892a' },
  match: { icon: '⚽', label: 'كورة', color: '#4a8a4a' },
  mayor: { icon: '🏛️', label: 'العمدة', color: '#8a6f2f' },
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
    jobs: [{ title: 'بياع ساندوتشات', wage: 138, start: 420, end: 1140 }],
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
    jobs: [{ title: 'خباز فطير', wage: 150, start: 300, end: 780 }],
    meal: { name: 'فطير مشلتت', cost: 20, hunger: 48 } },
  { id: 'wafaa', name: 'عمارة الوفاء', style: 'apartment', kind: 'home', x: 1060, y: 640, w: 130, h: 115, color: '#ceb08c', flats: 3, rent: 280 },

  /* ---- أرض فاضية في جنوب الحارة: هنا بيتبني البيت الجديد ---- */
  { id: 'lot1', name: 'أرض فاضية', style: 'lot', kind: 'land', x: 80, y: 795, w: 150, h: 105, color: '#cbb083' },
  { id: 'lot2', name: 'أرض فاضية', style: 'lot', kind: 'land', x: 250, y: 795, w: 150, h: 105, color: '#cbb083' },
  { id: 'lot3', name: 'أرض فاضية', style: 'lot', kind: 'land', x: 700, y: 795, w: 150, h: 105, color: '#cbb083' },
  /* ---- قسم الشرطة ومعرض العربيات في آخر الحارة ---- */
  { id: 'dealer', name: 'معرض عربيات النور', style: 'dealer', kind: 'work', x: 880, y: 795, w: 150, h: 105, color: '#c8d2dd',
    jobs: [{ title: 'سواق', wage: 70, start: 7 * 60, end: 23 * 60 }, { title: 'بياع عربيات', wage: 205, start: 9 * 60, end: 21 * 60 }] },
  { id: 'police', name: 'قسم شرطة الحارة', style: 'police', kind: 'work', x: 1058, y: 795, w: 142, h: 105, color: '#cfd9e4',
    jobs: [{ title: 'شرطي', wage: 195, start: 8 * 60, end: 23 * 60 }] },
];

/* ============================================================
   شكل البيوت: كل بيت بياخد لوك مختلف حسب الحي + بذرة البيت،
   وبيتخزّن مع البيت نفسه عشان ما يتغيّرش بعد الحفظ والتحميل،
   والجيران مش بيتشبهوا لبعض.
   ============================================================ */
export const NEIGHBOURHOODS = [
  { id: 'west', name: 'غرب الحارة', test: (x, y) => x < 520, walls: ['#d9b78c', '#cfa87f', '#d3ae84', '#c9a273'], trim: ['#8a6a45', '#7d5f3e', '#94714a'] },
  { id: 'east', name: 'شرق الحارة', test: (x, y) => x >= 720, walls: ['#d9b995', '#ceb08c', '#d7bda1', '#c7a17e'], trim: ['#8f7050', '#7a5b3c', '#9c7c56'] },
  { id: 'south', name: 'جنوب الحارة', test: (x, y) => y >= 600, walls: ['#cfa98a', '#c69a76', '#d8bda2', '#bfa07c'], trim: ['#7c5c3d', '#8a6a45', '#6f5234'] },
  { id: 'north', name: 'شمال الحارة', test: () => true, walls: ['#dcbc93', '#d2ac86', '#e0c39c', '#c9a780'], trim: ['#8b6b47', '#7f6040', '#97754d'] },
];

export const ROOF_STYLES = ['parapet', 'pitched', 'dome', 'ladder', 'deck'];
export const DOOR_STYLES = ['wood', 'metal', 'painted', 'grill'];

/* رندرة رقم بذرة ثابتة (نفس البيت = نفس الشكل دايمًا) */
function seeded(seed, salt = 0) {
  let x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const seededPick = (arr, seed, salt) => arr[Math.floor(seeded(seed, salt) * arr.length) % arr.length];

export function neighbourhoodOf(x, y) {
  for (const nb of NEIGHBOURHOODS) if (nb.test(x, y)) return nb;
  return NEIGHBOURHOODS[NEIGHBOURHOODS.length - 1];
}

export function homeSignature(look) {
  return [look.roof, look.wall, look.cols, look.doorStyle, look.doorColor, look.extras.join('+')].join('|');
}

/* neighbors: لوكات البيوت القريبة (عشان نمنع التشابه بين الجيران) */
export function makeHomeLook(seed, x, y, neighbors = []) {
  const nb = neighbourhoodOf(x, y);
  const nearSigs = new Set(neighbors.map(homeSignature));
  const nearWalls = new Set(neighbors.map(n => n.wall));
  const nearRoofs = new Set(neighbors.map(n => n.roof));
  const roofPool = nb.id === 'east' ? ['deck', 'parapet', 'pitched', 'ladder'] : ['parapet', 'ladder', 'pitched', 'dome', 'deck'];
  const doorColors = ['#6e4526', '#7a4a2c', '#3f5e6b', '#5c6b3f', '#7a3f3f', '#4a5a7a'];
  const extraPool = ['balcony', 'tanks', 'dish', 'laundry', 'ac', 'stairs', 'awning', 'band', 'shutters', 'bricks'];
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const salt = attempt * 7;
    /* الجار مش ياخد نفس لون الحي ولا نفس السقف لو فيه بدائل */
    const wallPool = nb.walls.filter(w => !nearWalls.has(w));
    const roofChoices = roofPool.filter(r => !nearRoofs.has(r));
    const look = {
      roof: seededPick(roofChoices.length ? roofChoices : roofPool, seed, 1 + salt),
      wall: seededPick(wallPool.length ? wallPool : nb.walls, seed, 2 + salt),
      trim: seededPick(nb.trim, seed, 3 + salt),
      cols: 2 + Math.floor(seeded(seed, 4 + salt) * 3),          /* ٢..٤ أعمدة شبابيك */
      rows: 2 + Math.floor(seeded(seed, 5 + salt) * 2),          /* ٢..٣ أدوار */
      doorStyle: seededPick(DOOR_STYLES, seed, 6 + salt),
      doorColor: seededPick(doorColors, seed, 7 + salt),
      extras: [],
      plaster: seeded(seed, 8) > 0.35,
      zone: nb.id,
      zoneName: nb.name,
      seed,
    };
    /* ٢–٣ تفاصيل خارجية مختلفة لكل بيت */
    const want = 2 + Math.floor(seeded(seed, 9) * 2);
    const pool = extraPool.slice();
    for (let k = 0; k < want && pool.length; k++) {
      const idx = Math.floor(seeded(seed, 20 + k) * pool.length) % pool.length;
      look.extras.push(pool.splice(idx, 1)[0]);
    }
    best = look;
    const sig = homeSignature(look);
    if (nearSigs.has(sig)) continue;                    /* نفس الشكل بالحرف؟ جرّب تاني */
    return look;
  }
  return best;
}

export const BUILD_COST = 1400;
export const BUILD_HOURS = [7, 19];
/* ---- عربيات المعرض ---- */
export const CAR_DOWN_RATE = 0.35;      /* مقدم التقسيط */
export const CAR_INSTALL_MONTHS = 8;    /* مدة التقسيط */

export const CAR_MODELS = [
  { id: '128', name: 'فيات ١٢٨', price: 4800, colors: ['#e8e0cd', '#c94f43', '#7f9bb0', '#d9b25a'], speed: 1.7 },
  { id: 'tuktuk', name: 'توك توك', price: 2600, colors: ['#2f8a7e', '#c94f43', '#3f6ab0'], speed: 1.35 },
  { id: 'verna', name: 'هيونداي فيرنا', price: 9200, colors: ['#b9c3cc', '#2f3a46', '#8f5a3a', '#d7d2c4'], speed: 2.2 },
  { id: 'pickup', name: 'شيفروليه بيك أب', price: 7600, colors: ['#d8d2c2', '#6b7a58', '#8a6a4a'], speed: 1.9 },
  { id: 'tuktuk_used', name: 'توك توك مستعمل', price: 1450, colors: ['#3f6ab0', '#c9a24a', '#7a8a5a'], speed: 1.25 },
];

/* أماكن الجلوس جوه المحل والبيت (نِسب من حجم الأوضة) */
const EAT_SEATS = [
  { x: 0.705, y: 0.67 }, { x: 0.775, y: 0.67 },
  { x: 0.865, y: 0.67 }, { x: 0.935, y: 0.67 },
];
const HOME_SEATS = [
  { x: 0.40, y: 0.78 }, { x: 0.50, y: 0.78 },
  { x: 0.60, y: 0.78 }, { x: 0.86, y: 0.78 },
];
export const SAVE_VERSION = 5;
export const SAVE_KEY = 'harat.save.v5';
export const SAVE_VERSION_LEGACY = [3, 4];   /* بنقبل الحفظ القديم ونطوّره */

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

export const RESIDENT_COUNT_CAP = 22;   /* adults + kids */
export const KIDS_CAP = 8;

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
    this.timeScale = 1;            /* مضاعف طول اليوم: ١ = ١٥٠ ثانية عند سرعة ١× */
    this.minute = 7 * 60 + 20;
    this.day = 1;
    this.places = [];
    this.residents = [];
    this.logs = [];
    this.seq = 1;
    this.nextRid = 1;
    this.nav = null;
    this.stats = { earned: 0, spent: 0, meals: 0, rent: 0, bills: 0, gigs: 0, hires: 0, sales: 0, salesCount: 0, talks: 0, builds: 0, weddings: 0, housed: 0, evictions: 0, fines: 0, taxes: 0, skips: 0 };
    this.mod = { foodPrice: 1, energyDrain: 1, moodBias: 0, until: 0, name: '' };
    this.dialogue = new DialogueEngine();
    this.mayor = freshMayorState();
    this.tutorial = new TutorialEngine();
    this.pendingConfirms = {};
    this.powerCut = false;
    this.events = [];
    this.lastEventDay = 0;
    this.eventPending = false;
    this.eventAt = 0;
    this.museAcc = 0;
    this.households = [];
    this.projects = [];
    this.nextHid = 1;
    this.nextPid = 1;
    this.buildQueue = [];
    this.savedAt = 0;
    /* عربيات، مشاوير، جرائم، كورة */
    this.cars = [];
    this.nextCarId = 1;
    this.rides = [];
    this.nextRideId = 1;
    this.incidents = [];
    this.nextIncId = 1;
    this.matches = [];
    this.nextMatchId = 1;
    this.trafficClock = 7 * 60;
    this.streetGameIn = 80;
    this.stats.skips = 0;
    this.stats.thefts = 0;
    this.stats.arrests = 0;
    this.stats.recovered = 0;
    this.stats.rides = 0;
    this.stats.fares = 0;
    this.stats.goals = 0;
    this.stats.carsSold = 0;
    this.stats.matches = 0;
  }

  /* ---------- helpers ---------- */
  /* طول اليوم بالساعات الحقيقية عند سرعة معيّنة */
  daySeconds(speed = this.speed) {
    /* timeScale = مضاعف طول اليوم: ٠٫٥ = يوم نص المدة، ٤ = يوم أطول ٤ مرات */
    const rate = SIM_MIN_PER_SEC * speed;
    return rate > 0 ? (1440 / rate) * this.timeScale : Infinity;
  }
  setDayLength(factor) {
    const f = Number(factor);
    if (!isFinite(f) || f <= 0) return { ok: false, reason: 'طول اليوم لازم يكون رقم أكبر من صفر' };
    this.timeScale = clamp(Number(f) || 1, 0.25, 4);
    return { ok: true, timeScale: this.timeScale, daySeconds: this.daySeconds() };
  }

  getPlace(id) { return this.places.find(p => p.id === id) || null; }

  /* كل بيت بياخد شكله مرة واحدة ويفضل معاه (وبيتحفظ جوه place.look) */
  applyHomeLooks() {
    const homes = this.places.filter(p => p.kind === 'home');
    for (const home of homes) {
      if (home.look) continue;
      const neighbors = homes
        .filter(o => o !== home && o.look && Math.hypot((o.x + o.w / 2) - (home.x + home.w / 2), (o.y + o.h / 2) - (home.y + home.h / 2)) < 260)
        .map(o => o.look);
      home.look = makeHomeLook(home.seed != null ? home.seed : (home.x + home.y), home.x + home.w / 2, home.y + home.h / 2, neighbors);
      home.color = home.look.wall;
    }
  }

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
    return this.places.filter(p => p.kind === 'home' && p.rentalsOpen !== false && this.freeFlatsIn(p) > 0);
  }
  allFreeFlats() {
    return this.places.filter(p => p.kind === 'home' && this.freeFlatsIn(p) > 0);
  }

  /* ---------- construction & the building centre ---------- */
  freeLots() { return this.places.filter(p => p.kind === 'land' && !p.project); }

  startProject(lotId, opts = {}) {
    const lot = this.getPlace(lotId);
    if (!lot || lot.kind !== 'land') return { ok: false, reason: 'دي مش أرض فاضية' };
    if (lot.project) return { ok: false, reason: 'الأرض دي بيتتبني بالفعل' };
    const owner = opts.ownerId ? this.getResident(opts.ownerId) : null;
    if (owner) {
      if (owner.child) return { ok: false, reason: 'الأطفال مش بيبنوا' };
      if (owner.money < BUILD_COST) return { ok: false, reason: 'معاهوش تكاليف البناء' };
      owner.money -= BUILD_COST;
      owner.stats.spent += BUILD_COST;
      this.stats.spent += BUILD_COST;
    }
    let name = opts.name || `عمارة ${owner ? owner.name.split(' ').slice(1).join(' ') || pick(NAME_LAST) : pick(NAME_LAST)}`;
    if (this.places.some(p => p.name === name) || this.projects.some(p => p.name === name)) {
      name = `${name} ${ar(this.projects.length + 1)}`;
    }
    const project = {
      id: this.nextPid++, lotId, name,
      progress: 0, startedDay: this.day,
      ownerId: owner ? owner.id : null,
      cost: BUILD_COST, builderId: null, done: false,
      hours: 0,
    };
    lot.project = project;
    lot.name = name;
    lot.building = true;
    lot.jobs = [{ title: 'عامل بناء', wage: 175, start: BUILD_HOURS[0] * 60, end: BUILD_HOURS[1] * 60, takenBy: null }];
    this.projects.push(project);
    this.addLog('build', `${owner ? owner.name : 'البلدية'} بدأ بناء «${name}» في الأرض الفاضية — تكلفة ${money(BUILD_COST)}.`, owner);
    if (!owner) this.toast('بدأ البناء في الأرض الفاضية');
    return { ok: true, project };
  }

  updateProjects(simDt) {
    for (const pr of this.projects) {
      if (pr.done) continue;
      const lot = this.getPlace(pr.lotId);
      if (!lot) continue;
      const hour = this.t;
      const onShift = hour >= BUILD_HOURS[0] * 60 && hour < BUILD_HOURS[1] * 60;
      if (!onShift) continue;
      const builder = this.workerAt(lot.id);
      const rate = builder ? 3.1 : 1.1;      /* % per sim hour */
      pr.progress = Math.min(100, pr.progress + rate * (simDt / 60));
      pr.hours += simDt / 60;
      if (pr.progress >= 100) this.finishProject(pr);
    }
  }

  finishProject(pr) {
    const lot = this.getPlace(pr.lotId);
    if (!lot) return;
    pr.done = true;
    lot.project = null;
    lot.building = false;
    lot.style = 'apartment';
    lot.kind = 'home';
    lot.flats = 2;
    lot.floors = 3;
    lot.rent = rndInt(250, 330);
    lot.ownerId = pr.ownerId || null;
    lot.households = [];
    lot.color = pick(['#d9b78c', '#cfa87f', '#d3ae84', '#ceb08c']);
    lot.jobs = null;
    lot.seed = (lot.seed != null ? lot.seed : 7) + 31;
    delete lot.look;
    this.applyHomeLooks();
    this.validateJobs();
    const owner = pr.ownerId ? this.getResident(pr.ownerId) : null;
    this.stats.builds = (this.stats.builds || 0) + 1;
    this.addLog('build', `خلص بناء «${lot.name}» 🎉 — بيت جديد بشقتين جاهز للسكن في الحارة.`, owner);
    if (owner) {
      owner.mood = clamp(owner.mood + 20, 0, 100);
      const household = this.householdOf(owner);
      if (household) {
        this.detachHousehold(household);
        if (!lot.households.includes(household.id)) lot.households.push(household.id);
        household.homeId = lot.id;
        household.rent = lot.rent;
        for (const id of household.members) {
          const m = this.getResident(id);
          if (m) { m.homeId = lot.id; m.rentAmount = Math.round(lot.rent / 2); m.rentDue = this.day + 7; m.rentNotice = 0; }
        }
        const partner = household.members.map(id => this.getResident(id)).find(m => m && m.id !== owner.id);
        this.addLog('home', `${owner.name}${partner ? ' و' + partner.name : ''} اتنقلوا يسكنوا في بيتهم الجديد «${lot.name}».`, owner);
        this.think(owner, this.line(owner, 'newHome'));
      } else {
        owner.homeId = lot.id;
        owner.rentAmount = Math.round(lot.rent / 2);
        owner.rentDue = this.day + 7;
        this.addLog('home', `${owner.name} سكن في بيته الجديد «${lot.name}».`, owner);
      }
      /* let the owner rent the spare flat out */
      if (this.freeFlatsIn(lot) > 0 && chance(0.6)) {
        this.addLog('build', `${owner.name} حاطط الشقة الفاضية في «${lot.name}» للإيجار بـ${money(lot.rent)}.`, owner);
      }
    }
    return lot;
  }

  validateJobs() {
    for (const r of this.residents) {
      if (!r.jobTitle) continue;
      const place = this.getPlace(r.workplaceId);
      const job = place && r.jobIndex >= 0 ? place.jobs && place.jobs[r.jobIndex] : null;
      if (!place || !job) {
        this.addLog('work', `خلص مشروع ${place ? place.name : 'الشغل'}… ${r.name} بقى بيدور على شغل تاني.`, r);
        r.workplaceId = null;
        r.jobTitle = null;
        r.jobIndex = -1;
        r.duty = null;
      }
    }
  }

  moveOutGrownKids() {
    const homeless = this.residents.filter(r => !r.child && !r.spouseId && !r.householdId && this.householdOf(r) === null && r.age >= 18);
    const grown = this.residents.filter(r => !r.child && !r.householdId && r.age >= 18);
    for (const r of grown) {
      const home = this.getPlace(r.homeId);
      if (!home) continue;
      const parents = this.residents.filter(p => p.parents && p.parents.includes(r.id));
      if (!parents.length) continue;          /* not a kid of that home */
      if (this.day < (r.leftHomeDay || 0)) continue;
      if (!chance(0.25)) { r.leftHomeDay = this.day + 1; continue; }
      const flats = this.freeFlats().filter(p => p.id !== r.homeId);
      if (!flats.length) break;
      const target = pick(flats);
      r.homeId = target.id;
      r.flatNo = (this.households.filter(h => h.homeId === target.id).length) + 1;
      r.rentAmount = Math.round((target.rent || 260) / 1.6);
      r.rentDue = this.day + 7;
      r.rentNotice = 0;
      r.mood = clamp(r.mood + 8, 0, 100);
      this.addLog('home', `${r.name} ساب بيت أهله وسكن لوحده في ${target.name}… «وقت الاعتماد على النفس».`, r);
      this.think(r, this.line(r, 'movedOut'));
      break;
    }
    return homeless.length > 0;
  }

  maybeNpcBuilding() {
    const lots = this.freeLots();
    if (!lots.length) return false;
    const candidates = this.residents.filter(r => !r.child && r.money >= BUILD_COST * 1.05 && r.age >= 20
      && this.places.filter(p => p.ownerId === r.id).length < 2);
    if (!candidates.length) return false;
    candidates.sort((a, b) => b.money - a.money);
    const r = candidates[0];
    if (!chance(0.25)) return false;
    const res = this.startProject(pick(lots).id, { ownerId: r.id });
    return res.ok;
  }

  /* ---------- logging ---------- */
  addLog(kind, text, r = null) {
    const entry = {
      id: this.seq++,
      day: this.day,
      time: tod(this.minute),
      minute: this.minute,
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

  /* جملة من محرّك الحوار: بتراعي الشغل والمزاج والوقت والعلاقة والأحداث الأخيرة */
  line(r, topic, extra = {}) {
    if (!r) return '';
    const text = this.dialogue.pick(this, r, topic, extra);
    if (text) { r.lastLine = text; return text; }
    const fallback = (LINES[topic] || []).map(e => e.t);
    return fallback.length ? pick(fallback) : '';
  }

  /* جملة سريعة من قايمة محلية: بتمنع إن الشخص يكرر آخر جُملة قالها */
  say(r, arr) {
    if (!r || !arr || !arr.length) return '';
    r.dlg = r.dlg || { used: {}, recent: [] };
    const quiet = (x) => {
      if (x === r.lastLine || r.dlg.recent.includes(x)) return false;
      const g = this.dialogue.lastSaid(x);
      return !(g && g.rid !== r.id && this.minute - g.at < 45);
    };
    let pool = arr.filter(quiet);
    if (!pool.length) pool = arr.filter(x => !r.dlg.recent.includes(x));
    const text = pick(pool.length ? pool : arr);
    this.dialogue.record(this, r, 'inline', text);
    r.lastLine = text;
    return text;
  }

  /* كل قد إيه حصل حدث من نوع معيّن (بالدقايق) — للجُمل اللي بتتكلم عن اللي حصل */
  recentEventAge(kind) {
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const e = this.logs[i];
      if (e.kind === kind) return Math.max(0, this.minute - (e.minute != null ? e.minute : this.minute));
    }
    return Infinity;
  }

  jobGroupOf(r) { return jobGroup(r && r.jobTitle); }

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
      place.stockMax = place.meal ? 14 : (place.products ? 30 : 0);
      place.stock = place.stockMax ? rndInt(3, 7) : 0;
      place.queue = [];
      place.salesToday = 0;
      place.ownerId = null;
      place.households = [];
      place.project = null;
      place.floors = place.flats ? 3 : 0;
      return place;
    });
    this.applyHomeLooks();
    this.nav = buildNav(this.places);
    this.started = true;
    this.minute = 7 * 60 + 20;
    this.day = 1;
    this.addLog('system', 'استدعيت حارة صغيرة في قلب مصر… الشوارع اتفترشت، والناس جاهزة تعيش.');
    this.addLog('system', 'انت الخالق هنا: مش بتلعب، انت بتتفرج على حياتهم.');
    for (let i = 0; i < 6; i++) this.spawnResident();
    this.ensurePublicJobs();
    this.seedFamilies(2);
    this.addLog('event', 'الحارة صحيت… في ناس بتفتح المحلات، وواحد بيجري ورا التوك توك، وست بتنده على عيالها.');
  }

  /* بيوت جاهزة من أول يوم — عشان الحارة تبقى فيها عيال وكورة */
  seedFamilies(count = 2) {
    for (let n = 0; n < count; n++) {
      const men = this.residents.filter(r => !r.child && !r.spouseId && r.gender === 'm');
      const women = this.residents.filter(r => !r.child && !r.spouseId && r.gender === 'f');
      if (!men.length || !women.length) break;
      const res = this.marry(pick(men), pick(women));
      if (!res.ok) break;
      const h = res.household;
      let kids = this.makeChild(this.getResident(h.members[0]), this.getResident(h.members[1]), h);
      if (kids && chance(0.55)) this.makeChild(this.getResident(h.members[0]), this.getResident(h.members[1]), h);
    }
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
      spouseId: null,
      householdId: null,
      parents: [],
      kids: [],
      child: false,
      marriedAt: null,
      duty: null,
      stage: 'single',
      crushes: [],
      quotes: [],
      speech: '',
      speechAt: -999,
      chatTimer: rnd(5, 14),
      nextShop: this.minute + rnd(90, 260),
      carry: null,
      serveAt: -999,
      lastLine: '',
      /* ليل ونوم، دخول البيوت */
      indoors: false,
      anim: null,
      stuck: 0,
      repaths: 0,
      lastX: 0,
      lastY: 0,
      /* جرائم وشرطة */
      thief: !opts.child && chance(0.16),
      record: 0,
      arrestedUntil: 0,
      onDuty: false,
      /* عربيات ومشاوير */
      carId: null,
      rideId: null,
      matchId: null,
      shiftFare: 0,
    };

    /* start out as strangers who recognise each other */
    for (const o of this.residents) {
      const base = rndInt(6, 24);
      r.rel[o.id] = { aff: base, chats: 0, last: -999, friends: 0 };
      o.rel[r.id] = { aff: clamp(base + rndInt(-5, 5), 0, 100), chats: 0, last: -999, friends: 0 };
    }

    this.residents.push(r);

    /* try to find a job on the same day — food shops first so the kitchens are alive */
    const slots = this.availableJobs();
    if (slots.length) {
      const foodSlots = slots.filter(sl => this.foodPlace(sl.place));
      const pubSlots = slots.filter(sl => ['police', 'dealer'].includes(sl.place.id) &&
        (sl.job.title === 'شرطي' ? this.officers().length < 1 : this.drivers().length < 1));
      let slot;
      if (pubSlots.length && chance(0.45)) slot = pick(pubSlots);
      else slot = pick(foodSlots.length && chance(0.72) ? foodSlots : slots);
      this.hire(r, slot);
    }

    const jobTxt = r.jobTitle ? `اشتغل ${r.jobTitle} في ${this.getPlace(r.workplaceId).name}` : 'نزل يدور على شغل';
    this.addLog('system', `وصل ساكن جديد للحارة: ${r.name} (${ar(r.age)} سنة) — سكن في ${home.name} شقة ${ar(flatNo)}، و${jobTxt}.`, r);
    this.think(r, this.say(r, ['حارة جديدة… ربنا يسهّل.', 'الشقة صغيرة، بس دي بداية.', 'أول مرة أسكن في حارة زي دي… يارب تعجبني.']));
    return r;
  }

  /* وظايف لازم تكون مشغولة: شرطي في القسم، وسواق في المعرض */
  ensurePublicJobs() {
    const station = this.policeStation();
    if (station && station.jobs && this.officers().length < 1) {
      const idx = station.jobs.findIndex(j => !j.takenBy);
      if (idx >= 0) {
        const cand = this.residents.find(r => !r.child && !this.isLockedUp(r));
        if (cand) this.hire(cand, { place: station, job: station.jobs[idx], index: idx });
      }
    }
    const dealer = this.dealership();
    if (dealer && dealer.jobs && this.residents.length >= 10 && this.drivers().length < 1) {
      const idx = dealer.jobs.findIndex(j => !j.takenBy && j.title === 'سواق');
      if (idx >= 0) {
        let cand = this.residents.find(r => !r.child && !this.isLockedUp(r) && !r.jobTitle);
        if (!cand) {
          /* مفيش حد فاضي: ناخد واحد بيسوق أصلًا أو واحد دخله ضعيف */
          const poors = this.residents.filter(r => !r.child && !this.isLockedUp(r) && r.money < 320 &&
            r.workplaceId !== 'police' && !this.carOf(r));
          if (poors.length) {
            poors.sort((a, b) => a.money - b.money);
            cand = poors[0];
            const old = cand.jobTitle;
            this.addLog('work', `${cand.name} ساب شغل ${old || 'اليومية'} واشتغل سواق في ${dealer.name} — المعرض وفّرله عربية.`, cand);
            cand.jobTitle = null; cand.workplaceId = null; cand.jobIndex = -1;
          }
        }
        if (cand) this.hire(cand, { place: dealer, job: dealer.jobs[idx], index: idx });
      }
    }
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
    if (slot.job.title === 'سواق') this.assignCompanyCar(r);
    this.addLog('work', `اتعيّن ${r.jobTitle} في ${slot.place.name}.`, r);
  }

  /* ---------- shops, food service & staff ---------- */
  foodPlace(p) { return !!(p && p.meal && p.kind !== 'charity' && p.kind !== 'land'); }

  staffOf(place) {
    if (!place || !place.jobs) return [];
    return place.jobs
      .map((job, index) => ({ job, index, worker: job.takenBy ? this.getResident(job.takenBy) : null }))
      .filter(x => x.worker);
  }

  shopStatus(place) {
    if (!place) return { open: false, reason: 'missing', label: 'مفيش مكان' };
    if (place.kind === 'land') {
      if (place.project) return { open: false, reason: 'building', label: 'بيتبني' };
      return { open: false, reason: 'land', label: 'أرض فاضية' };
    }
    if (place.kind === 'home') return { open: false, reason: 'home', label: 'عمارة سكنية' };
    const sells = this.foodPlace(place) || (place.products && place.products.length);
    if (!sells) return { open: false, reason: 'plain', label: 'مش محل' };
    const staff = this.staffOf(place);
    if (!staff.length) return { open: false, reason: 'no-staff', label: 'مقفول — مفيش بياع', staff };
    const job = staff[0].job;
    const hour = Math.floor(this.t);
    if (hour < job.start || hour >= job.end) {
      return { open: false, reason: 'hours', label: `مقفول — يفتح ${timeLabel(job.start)}`, staff, job };
    }
    if (this.foodPlace(place) && place.stock <= 0) {
      return { open: false, reason: 'empty', label: 'خلص الأكل', staff, job };
    }
    return { open: true, reason: 'open', label: 'مفتوح', staff, job };
  }

  openFoodShops() {
    return this.places.filter(p => this.foodPlace(p) && this.shopStatus(p).open);
  }

  queueSlot(place, idx) {
    if (idx <= 0) return { x: place.door.x - 11, y: place.door.y + 7 };
    return { x: place.door.x - 40 - (idx - 1) * 14, y: place.door.y + 21 + ((idx - 1) % 2) * 4 };
  }

  queueIndex(place, r) { return place.queue.indexOf(r.id); }
  joinQueue(place, r) { if (!place.queue.includes(r.id)) place.queue.push(r.id); }
  leaveQueue(place, r) { place.queue = place.queue.filter(id => id !== r.id); }

  buyFood(r, place) {
    const meal = place.meal;
    const price = Math.round(meal.cost * (this.mod.foodPrice || 1));
    if (r.money < price) return this.eatFree(r);
    this.addLog('food', `نازل ${place.name} ياكل ${meal.name} (${money(price)}).`, r);
    this.goToPlace(r, place, 'buy', {
      duration: 0,
      product: { name: meal.name, price, hunger: meal.hunger, icon: '🍽️' },
      price,
      silent: true,
    });
    r.task.stage = 'queue';
    r.task.startedAt = this.minute;
    r.task.stageUntil = 0;
    return true;
  }

  dropBuy(r, why, moodHit = 5) {
    const task = r.task;
    if (task && task.placeId) {
      const place = this.getPlace(task.placeId);
      if (place) this.leaveQueue(place, r);
    }
    r.task = null;
    r.phase = 'idle';
    r.until = null;
    r.micro = null;
    r.mood = clamp(r.mood - moodHit, 0, 100);
    if (why) this.addLog('food', `مشي من غير أكل: ${why}.`, r);
    return false;
  }

  updateBuyer(r) {
    const task = r.task;
    const place = this.getPlace(task.placeId);
    if (!place) return this.dropBuy(r, 'المكان قفل');
    const st = this.shopStatus(place);
    const waited = this.minute - (task.startedAt || this.minute);

    if (task.stage === 'queue') {
      this.joinQueue(place, r);
      const idx = this.queueIndex(place, r);
      const slot = this.queueSlot(place, idx);
      r.micro = { x: slot.x, y: slot.y };
      if (!st.open) {
        if (st.reason === 'empty') return this.dropBuy(r, 'الأكل خلص والسكان زحمة');
        if (waited > 14) return this.dropBuy(r, st.reason === 'no-staff' ? 'المحل مقفول ومفيش بياع' : 'المحل قفل');
      }
      if (idx === 0 && st.open) {
        task.stage = 'order';
        task.stageUntil = this.minute + rnd(2, 5);
        task.queueAt = this.minute;
      } else if (waited > 75) {
        return this.dropBuy(r, 'الطابور طوّل… مش نافع');
      }
      return;
    }

    if (task.stage === 'order') {
      r.micro = this.queueSlot(place, 0);
      if (this.minute >= task.stageUntil) {
        if (place.stock <= 0) return this.dropBuy(r, 'خلص الأكل قبل ما يطلب');
        place.stock--;
        this.addLog('work', `طلب ${r.name} ${task.product.name}… واتحضّر على الكاونتر.`, this.staffOf(place)[0] ? this.staffOf(place)[0].worker : null);
        task.stage = 'pay';
        task.stageUntil = this.minute + rndInt(1, 3);
      }
      return;
    }

    if (task.stage === 'pay') {
      if (this.minute >= task.stageUntil) {
        if (r.money < task.price) return this.dropBuy(r, 'الفلوس مش كفاية');
        const cost = task.price;
        r.money -= cost;
        r.stats.spent += cost;
        this.stats.spent += cost;
        this.stats.meals++;
        r.stats.meals++;
        r.hunger = clamp(r.hunger - (task.product.hunger || 30), 0, 100);
        r.mood = clamp(r.mood + 6, 0, 100);
        place.salesToday = (place.salesToday || 0) + 1;
        this.leaveQueue(place, r);
        this.addLog('money', `دفع ${money(cost)} على ${task.product.name} في ${place.name}.`, r);
        const staff = this.staffOf(place).find(x => x.worker);
        if (staff) {
          const comm = Math.max(2, Math.round(cost * 0.3));
          const cook = staff.worker;
          cook.money += comm;
          cook.stats.earned += comm;
          this.stats.earned += comm;
          cook.mood = clamp(cook.mood + 2, 0, 100);
          this.addLog('money', `باع ${task.product.name} لـ${r.name} — حصته ${money(comm)}.`, cook);
          this.fx('sale', place.door.x + 4, place.door.y + 14, `+${money(comm)}`);
          this.bumpRel(r, cook, 3);
          if (chance(0.35)) {
            this.talkTo(r, cook,
              this.line(r, 'customer').replace('{p}', task.product.name).replace('{n}', cook.name.split(' ')[0]),
              this.line(cook, 'seller', { partner: r }).replace('{n}', r.name.split(' ')[0]));
          }
        }
        task.stage = 'eat';
        task.stageUntil = this.minute + rnd(18, 40);
        r.carry = task.product.icon || '🍽️';
        const seat = { x: place.door.x + 26 + rnd(-8, 8), y: place.door.y + 24 };
        r.micro = seat;
      }
      return;
    }

    if (task.stage === 'eat') {
      if (this.minute >= task.stageUntil) {
        r.carry = null;
        r.until = null;
        r.task = null;
        r.phase = 'idle';
        r.micro = null;
        this.think(r, this.line(r, 'ate'));
      }
    }
  }

  updateDuty(r) {
    const place = this.getPlace(r.task.placeId);
    if (!place || !this.foodPlace(place)) return;
    const d = r.duty || (r.duty = { state: 'cook', until: this.minute + rnd(10, 20), nextAdd: this.minute });
    const stove = { x: place.door.x - 27, y: place.door.y - 1 };
    const counter = { x: place.door.x + 5, y: place.door.y + 2 };
    const waiting = place.queue.length > 0;

    if (d.state === 'cook') {
      r.carry = null;
      if (this.minute >= d.nextAdd) {
        d.nextAdd = this.minute + 26;
        if (place.stock < place.stockMax) place.stock++;
      }
      r.micro = stove;
      if (waiting) { d.state = 'carry'; d.until = this.minute + 4; }
      else if (this.minute >= d.until) { d.state = 'carry'; d.until = this.minute + 5; }
      return;
    }
    if (d.state === 'carry') {
      r.carry = '🍽️';
      r.micro = counter;
      if (this.minute >= d.until) { d.state = 'serve'; d.until = this.minute + 20; }
      return;
    }
    /* serve */
    r.carry = null;
    r.micro = counter;
    const front = place.queue.length ? this.getResident(place.queue[0]) : null;
    if (front && front.task && front.task.stage === 'order') {
      front.task.stageUntil = Math.min(front.task.stageUntil || 0, this.minute + 2);
    }
    if (this.minute >= d.until) {
      if (!waiting) { d.state = 'cook'; d.until = this.minute + rnd(12, 24); d.nextAdd = this.minute; }
      else d.until = this.minute + 10;
    }
  }

  /* ---------- households, marriage & kids ---------- */
  householdOf(r) { return r.householdId ? this.households.find(h => h.id === r.householdId) || null : null; }

  detachHousehold(household) {
    if (!household) return;
    const old = this.getPlace(household.homeId);
    if (old && Array.isArray(old.households)) {
      old.households = old.households.filter(id => id !== household.id);
    }
  }

  flatUse(home) {
    if (!home) return 0;
    const households = this.households.filter(h => h.homeId === home.id).length;
    const singles = this.residents.filter(r => !r.householdId && r.homeId === home.id && !r.child).length;
    return households + singles;
  }

  freeFlatsIn(home) { return home ? Math.max(0, (home.flats || 0) - this.flatUse(home)) : 0; }

  related(a, b) {
    if (!a || !b) return true;
    if (a.parents && a.parents.includes(b.id)) return true;
    if (b.parents && b.parents.includes(a.id)) return true;
    if (a.parents && b.parents && a.parents.some(p => b.parents.includes(p))) return true;
    if (a.spouseId === b.id || b.spouseId === a.id) return true;
    return false;
  }

  childrenOf(r) { return this.residents.filter(x => x.parents && x.parents.includes(r.id)); }

  pickHomeForCouple(a, b) {
    const candidates = this.places.filter(p => p.kind === 'home' && this.freeFlatsIn(p) > 0);
    if (!candidates.length) return null;
    const own = candidates.filter(p => p.id === a.homeId || p.id === b.homeId);
    if (own.length) {
      own.sort((x, y) => (x.rent || 0) - (y.rent || 0));
      return own[0];
    }
    candidates.sort((x, y) => (x.rent || 0) - (y.rent || 0));
    return candidates[0];
  }

  engage(a, b) {
    a.stage = 'engaged';
    b.stage = 'engaged';
    a.engagedTo = b.id;
    b.engagedTo = a.id;
    a.mood = clamp(a.mood + 14, 0, 100);
    b.mood = clamp(b.mood + 14, 0, 100);
    this.addLog('love', `${a.name} اتقدّم لـ${b.name}… واتفقوا يتجوزوا، بس لسه بيدوروا على شقة.`, a);
    this.talkTo(a, b, 'إيه رأيك نتجوز؟', 'أنا موافقة… بس محتاجين شقة.');
  }

  marry(a, b) {
    if (!a || !b || a.spouseId || b.spouseId) return { ok: false, reason: 'مفيش' };
    let home = this.pickHomeForCouple(a, b);
    let doubled = false;
    if (!home) {
      /* مفيش شقة فاضية؟ العروسين يسكنوا مع الأهل في نفس البيت */
      home = [this.getPlace(a.homeId), this.getPlace(b.homeId)].find(p => p && p.kind === 'home') || null;
      doubled = !!home;
    }
    if (!home) return { ok: false, reason: 'مفيش شقة فاضية' };
    const hid = this.nextHid++;
    const members = [a.id, b.id];
    const household = { id: hid, homeId: home.id, members, kids: [], since: this.day, rent: home.rent || 280 };
    this.households.push(household);
    home.households = home.households || [];
    home.households.push(hid);
    for (const p of [a, b]) {
      const other = p === a ? b : a;
      p.spouseId = other.id;
      p.householdId = hid;
      p.marriedAt = this.day;
      p.stage = 'married';
      p.homeId = home.id;
      p.engagedTo = null;
      p.rentAmount = Math.round((home.rent || 280) / 2);
      p.mood = clamp(p.mood + 18, 0, 100);
      p.relInit ? null : null;
    }
    this.relInit(a, b);
    a.rel[b.id].aff = b.rel[a.id].aff = 100;
    a.rel[b.id].friends = b.rel[a.id].friends = 2;
    this.stats.weddings = (this.stats.weddings || 0) + 1;
    this.addLog('love', doubled
      ? `${a.name} و${b.name} اتجوزوا! 🎉 مفيش شقة فاضية، فسكنوا مع الأهل في ${home.name}.`
      : `${a.name} و${b.name} اتجوزوا! 🎉 كتب كتاب وفرح في الحارة، وسكنوا في ${home.name} شقة ${ar(this.households.filter(h => h.homeId === home.id).length)}.`, a);
    for (const r of this.residents) r.mood = clamp(r.mood + 4, 0, 100);
    this.fx && this.fx('wedding', home.door.x, home.door.y - 20, '🎉');
    return { ok: true, household, home };
  }

  tryMarriages() {
    const singles = this.residents.filter(r => !r.child && r.age >= 18 && !r.spouseId);
    /* finish engagements first */
    for (const a of singles) {
      if (a.stage !== 'engaged' || !a.engagedTo) continue;
      const b = this.getResident(a.engagedTo);
      if (!b || b.spouseId) { a.stage = 'single'; a.engagedTo = null; continue; }
      const home = this.pickHomeForCouple(a, b);
      if (home) return this.marry(a, b);
    }
    for (let i = 0; i < singles.length; i++) {
      for (let j = i + 1; j < singles.length; j++) {
        const a = singles[i], b = singles[j];
        if (a.gender === b.gender) continue;
        if (a.spouseId || b.spouseId) continue;
        if (a.stage === 'engaged' || b.stage === 'engaged') continue;
        if (this.related(a, b)) continue;
        const A = a.rel[b.id], B = b.rel[a.id];
        if (!A || !B) continue;
        if (A.aff < 68 || B.aff < 68) continue;
        if ((A.chats || 0) < 5 || (B.chats || 0) < 5) continue;
        if (!chance(0.4)) continue;
        return this.marry(a, b).ok ? true : (this.engage(a, b), true);
      }
    }
    return false;
  }

  tryChildren() {
    const kids = this.residents.filter(r => r.child).length;
    if (kids >= KIDS_CAP) return false;
    /* بيت فيه جوزين (ممكن ساكنين مع الأهل) لسه ممكن يخلفوا */
    const homes = this.households.filter(h => h.members.filter(id => {
      const m = this.getResident(id);
      return m && !m.child;
    }).length >= 2 && h.kids.length < 3);
    for (const h of homes) {
      const a = this.getResident(h.members[0]);
      const b = this.getResident(h.members[1]);
      if (!a || !b || a.child || b.child) continue;
      const home = this.getPlace(h.homeId);
      if (!home) continue;
      if (this.day - (h.since || 0) < 2) continue;
      if (this.residents.length >= RESIDENT_COUNT_CAP) continue;
      if (a.age > 46 || b.age > 46) continue;
      if (!chance(0.3)) continue;
      this.makeChild(a, b, h);
      return true;
    }
    return false;
  }

  makeChild(a, b, household) {
    if (!household || !a || !b) return null;
    const home = this.getPlace(household.homeId);
    const mother = a.gender === 'f' ? a : b;
    const father = a.gender === 'f' ? b : a;
    const gender = chance(0.5) ? 'm' : 'f';
    let first = gender === 'm' ? pick(NAME_FIRST_M) : pick(NAME_FIRST_F);
    const last = father.name.split(' ').slice(1).join(' ') || pick(NAME_LAST);
    let name = `${first} ${last}`;
    if (this.residents.some(r => r.name === name)) name = `${first} ${pick(NAME_LAST)}`;
    const male = gender === 'm';
    const look = {
      height: 0.62, build: 0.78,
      top: male ? pick(MALE_SHIRTS) : pick(FEMALE_DRESS),
      pants: pick(PANTS), galabeya: chance(0.4),
      hijab: !male && chance(0.3), hijabColor: pick(HIJABS),
      hair: pick(HAIRS2), hairStyle: male ? 'short' : 'long',
      beard: false, moustache: false, glasses: chance(0.1), shoe: '#3a2f26',
      bag: null, apron: null, skinTone: pick(SKIN_TONES),
    };
    const kid = {
      id: this.nextRid++,
      name, gender, age: rndInt(0, 2),
      color: look.top, look,
      skin: look.skinTone, hair: look.hair,
      x: home ? home.door.x + rnd(-14, 14) : mother.x + rnd(-10, 10),
      y: home ? home.door.y + rnd(-4, 10) : mother.y + rnd(-8, 8),
      homeId: household.homeId, flatNo: mother.flatNo,
      workplaceId: null, jobTitle: null, jobIndex: -1,
      money: 0, hunger: rnd(10, 30), energy: rnd(70, 95), mood: rnd(65, 90),
      thought: '', thoughtAt: -999, moodAt: -999,
      phase: 'idle', task: null, path: [], until: null, spawnAt: 0,
      jitter: { x: rnd(-10, 10), y: rnd(-5, 7) },
      nextMuse: this.minute + rnd(200, 400),
      rentAmount: 0, rentDue: 9999, rentNotice: 0,
      billAmount: 0, billDue: 9999, billNotice: 0,
      powerCut: false, arrivedDay: this.day,
      stats: { earned: 0, spent: 0, meals: 0, shifts: 0, served: 0 },
      nextEvent: this.minute + rnd(200, 500),
      rel: {}, spouseId: null, householdId: household.id,
      parents: [mother.id, father.id], kids: [], child: true,
      marriedAt: null, duty: null, stage: 'child', crushes: [], quotes: [],
      speech: '', speechAt: -999, chatTimer: rnd(5, 12),
      nextShop: this.minute + 999, carry: null, serveAt: -999, lastLine: '',
      schoolDone: 0,
    };
    for (const o of this.residents) {
      kid.rel[o.id] = { aff: rndInt(20, 45), chats: 0, last: -999, friends: 0 };
      o.rel[kid.id] = { aff: rndInt(15, 40), chats: 0, last: -999, friends: 0 };
    }
    this.residents.push(kid);
    household.kids.push(kid.id);
    mother.kids.push(kid.id);
    father.kids.push(kid.id);
    mother.mood = clamp(mother.mood + 15, 0, 100);
    father.mood = clamp(father.mood + 15, 0, 100);
    this.addLog('love', `اتولد ${gender === 'm' ? 'مولود' : 'مولودة'} جديد في بيت ${father.name.split(' ')[0]}: ${name} 👶`, father);
    this.think(mother, this.line(mother, 'kidBorn'));
    return kid;
  }

  growResidents(dt) {
    /* kept for API compatibility — children grow one year per day-rollover */
  }

  ageChildren() {
    for (const r of this.residents) {
      if (!r.child) continue;
      if (!chance(0.55)) continue;
      r.age++;
      if (r.age === 6 && chance(0.5)) {
        this.addLog('event', `${r.name} دخل المدرسة النهاردة… شنطة وزي مدرسي.`, r);
        r.mood = clamp(r.mood + 6, 0, 100);
      }
      if (r.age >= 18) {
        r.child = false;
        r.stage = 'single';
        r.rentAmount = 260;
        r.rentDue = this.day + 6;
        r.billAmount = rndInt(70, 120);
        r.billDue = this.day + 8;
        r.jobTitle = null;
        r.workplaceId = null;
        r.jobIndex = -1;
        r.nextShop = this.minute + rnd(60, 200);
        const household = this.householdOf(r);
        if (household) {
          household.kids = household.kids.filter(id => id !== r.id);
          r.householdId = null;
        }
        this.addLog('event', `${r.name} كبر وبقى ${ar(r.age)} سنة… بقى من الكبار في الحارة وبيدور على شغل وشقة.`, r);
        this.think(r, this.line(r, 'grown'));
      }
    }
  }

  childDecide(r) {
    const t = this.t;
    const home = this.getPlace(r.homeId);
    if (!home) return this.wander(r);
    if (r.energy < 25) return this.goToPlace(r, home, 'sleep', { duration: 220, thought: 'تعبان… هنام شوية.', silent: true });
    if (t >= 21 * 60 || t < 6 * 60) {
      return this.goToPlace(r, home, 'sleep', { duration: 300, silent: true });
    }
    const school = this.places.find(p => p.style === 'school');
    if (r.age >= 6 && t >= 8 * 60 && t < 13 * 60 && school) {
      return this.goToPlace(r, school, 'school', { duration: rndInt(80, 140), silent: true });
    }
    if (r.hunger > 42) {
      this.addLog('food', 'رجع البيت ياكل مع أهله.', r);
      return this.goToPlace(r, home, 'eat', {
        duration: 30, paid: true, childMeal: true,
        meal: { name: 'أكل البيت', cost: 0, hunger: 34 },
        silent: true,
      });
    }
    /* كورة: الملعب أو الشارع بعد المدرسة */
    if (t >= 14 * 60 + 30 && t < 20 * 60 && chance(0.62)) {
      const pitch = this.getPlace('pitch');
      if (pitch) {
        return this.goToPlace(r, pitch, 'play', {
          duration: rndInt(50, 95),
          thought: pick(['يلا نلعب كورة في الملعب!', 'أصحابي مستنيين في الملعب.', 'النهاردة هنكسب.'],),
          silent: true,
        });
      }
    }
    if (chance(0.45)) {
      const fun = this.places.find(p => p.style === 'youth') || this.places.find(p => p.style === 'pitch');
      if (fun) return this.goToPlace(r, fun, 'play', { duration: rndInt(40, 80), thought: pick(['يلا نلعب شوية!', 'أصحابي مستنيين بره.']), silent: true });
    }
    const parent = this.getResident(r.parents[0]) || this.getResident(r.parents[1]);
    if (parent && parent.homeId === r.homeId) {
      return this.goToPlace(r, home, 'family', { duration: rndInt(40, 90), silent: true });
    }
    return this.wander(r);
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
    this.relInit(a, b);
    a.rel[b.id].chats = (a.rel[b.id].chats || 0) + 1;
    b.rel[a.id].chats = (b.rel[a.id].chats || 0) + 1;
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
      const lineA = this.line(r, 'argue', { partner: best });
      const lineB = this.line(best, 'argue', { partner: r });
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

    const topicA = aff >= 45 ? 'friends' : aff >= 20 ? 'small' : 'greet';
    const lineA = this.line(r, topicA, { partner: best }).replace('{n}', short);
    const lineB = this.line(best, 'reply', { partner: r }).replace('{n}', r.name.split(' ')[0]);
    this.talkTo(r, best, lineA, lineB);

    /* feelings quietly grow */
    if (r.gender !== best.gender && chance(0.14) && this.affOf(r, best) > 30 && !r.crushes.includes(best.id)) {
      r.crushes.push(best.id);
      r.mood = clamp(r.mood + 8, 0, 100);
      this.addLog('event', `${r.name} حاسس إن قلبه مال لـ${best.name}… ومش عارف يقولها.`, r);
      this.think(r, this.line(r, 'love'));
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
    if (!place) return this.wander(r);
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
        buy: `رايح ${place.name} ياكل.`,
        build: `رايح يشتغل في ${place.name}.`,
        school: `رايح المدرسة.`,
        play: `نازل يلعب في ${place.name}.`,
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
      const job = place.jobs && place.jobs[r.jobIndex];
      duration = Math.max(18, job.end - this.t);
      task.workStart = this.minute;
    }
    r.until = this.minute + duration;

    /* سرقة: التنفيذ لحظة الوصول للبيت/الشخص */
    if (task.kind === 'robbery' && place) {
      let ok = false;
      if (task.person && task.victimId) ok = this.commitMugging(r, this.getResident(task.victimId));
      else ok = this.commitRobbery(r, place);
      if (this.isLockedUp(r)) return;
      r.task = null;
      r.phase = 'idle';
      r.until = null;
      if (ok) this.think(r, this.say(r, ['الفلوس في جيبي… يلا أجري.', 'محدش شاف حاجة… الحمد لله.', 'لو فضلت كده، هلبس في يوم.']));
      return;
    }

    if (task.kind === 'buy' && place) {
      r.until = null;
      task.stage = 'queue';
      task.startedAt = this.minute;
      task.stageUntil = 0;
      this.joinQueue(place, r);
      if (chance(0.5)) this.addLog('food', `${r.name} دخل ${place.name} ووقف في الطابور.`, r);
      return;
    }

    if (task.kind === 'work' && place && this.foodPlace(place) && r.jobIndex >= 0) {
      r.duty = { state: 'cook', until: this.minute + rnd(8, 18), nextAdd: this.minute + 4 };
      const job = place.jobs && place.jobs[r.jobIndex];
      const shiftStart = this.minute <= job.start + 25;
      if (job && shiftStart && place.stock < Math.ceil(place.stockMax * 0.4)) {
        place.stock = Math.ceil(place.stockMax * 0.55);
        this.addLog('work', `جهّز بضاعة النهاردة في ${place.name} (${ar(place.stock)} طلب جاهز).`, r);
      }
    }

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
      this.think(r, this.line(r, 'jobFail'));
    }

    if (task.kind === 'work' && place) {
      this.addLog('work', this.foodPlace(place)
        ? `دخل المطبخ في ${place.name}… بيجهّز الأكل النهاردة.`
        : `بدأ شغله النهاردة (${r.jobTitle || 'شغل'}) في ${place.name}.`, r);
    }
    if ((task.kind === 'eat' || task.kind === 'shop') && place) {
      const server = this.workerAt(place.id);
      if (server && server.id !== r.id) {
        task.serverId = server.id;
        const order = task.kind === 'shop' ? (task.product ? task.product.name : 'حاجة') : (place.meal ? place.meal.name : 'طلب');
        task.orderName = order;
        const qlen = this.residents.filter(o => o !== r && o.task && o.task.kind === task.kind && o.task.placeId === place.id && o.phase === 'act').length;
        if (qlen > 0) this.think(r, this.line(r, 'queue'));
        if (chance(0.65)) {
          this.addLog('work', `جاله زبون: ${r.name} عايز ${order}.`, server);
          this.think(server, this.say(server, ['الزبون ده محترم…', 'الشغل ماشي النهاردة.', 'يلا نخدم الراجل.']));
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
    if (task.kind === 'play' && place && place.style === 'pitch') {
      const m = this.joinMatch(r);
      if (m) return;
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

    /* الدخول جوه البيت: يفتح الباب، يعدّي، يختفي، والباب يتقفل وراه */
    if (place && place.kind === 'home' && !r.indoors &&
        ['sleep', 'family', 'eat', 'bills', 'rent'].includes(task.kind)) {
      r.x = place.door.x + r.jitter.x * 0.25;
      r.y = place.door.y;
      r.path = [];
      r.phase = 'enter';
      r.anim = { dir: 'in', t: 0, placeId: place.id };
      r.until = this.minute + (task.duration || 30);
    }
  }

  finish(r) {
    const task = r.task;
    const place = task ? this.getPlace(task.placeId) : null;
    const wasInside = r.indoors;
    r.task = null;
    r.phase = 'idle';
    r.until = null;
    if (!task) return;

    switch (task.kind) {
      case 'work': {
        if (r.duty) r.duty = null;
        r.carry = null;
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
          this.think(r, this.line(r, 'wageShort'));
        } else {
          this.think(r, this.line(r, 'wage'));
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
        if (task.childMeal) {
          r.hunger = clamp(r.hunger - meal.hunger, 0, 100);
          r.mood = clamp(r.mood + 5, 0, 100);
          break;
        }
        if (task.paid) {
          r.money -= 0;    // charity meal
          r.mood = clamp(r.mood - 3, 0, 100);
          this.addLog('food', `أكل ${meal.name} في ${place ? place.name : 'سبيل الخير'}… من غير فلوس.`, r);
          if (chance(0.3)) this.think(r, this.line(r, 'charity'));
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
          this.think(r, this.line(r, 'ate'));
          this.payCounter(r, task, place, cost, meal.name);
          if (task.serverId) {
            const cook = this.getResident(task.serverId);
            if (cook && chance(0.5)) {
              this.talkTo(r, cook,
                this.line(r, 'customer').replace('{p}', meal.name).replace('{n}', cook.name.split(' ')[0]),
                this.line(cook, 'seller', { partner: r }).replace('{n}', r.name.split(' ')[0]));
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
        this.think(r, this.line(r, 'billPaid'));
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
        const landlord = place && place.ownerId ? this.getResident(place.ownerId) : null;
        if (landlord && landlord.id !== r.id) {
          landlord.money += amount;
          landlord.stats.earned += amount;
          landlord.stats.rentIncome = (landlord.stats.rentIncome || 0) + amount;
          this.addLog('money', `حصل على إيجار ${money(amount)} من ${r.name} — شقة في ${place.name}.`, landlord);
        }
        this.addLog('money', `دفع إيجار الشقة في ${place ? place.name : 'العمارة'}: ${money(amount)}.`, r);
        this.think(r, this.line(r, 'rentPaid'));
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
        this.think(r, this.say(r, ['كل قرش بشقاه… بس الحمد لله.', 'اليومية مشيت النهاردة.', 'لو الشغل ده ثابت، كنت ارتحت.']));
        break;
      }
      case 'shop': {
        const price = task.price || 0;
        const product = task.product || { name: 'حاجة', icon: '🛍️' };
        if (r.money < price) {
          this.addLog('money', `دخل ${place ? place.name : 'المحل'} وشاف السعر… ورجع من غير ما يشتري.`, r);
          this.think(r, this.say(r, ['السعر غالي عليّا…', 'هستنى لحد ما الفلوس تتحسن.']));
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
              this.line(r, 'customer').replace('{p}', product.name).replace('{n}', seller.name.split(' ')[0]),
              this.line(seller, 'seller', { partner: r }).replace('{n}', r.name.split(' ')[0]));
          }
        }
        this.think(r, this.line(r, 'shopped'));
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
        if (chance(0.5)) this.think(r, this.line(r, 'family'));
        break;
      }
      case 'buy': break;
      case 'school': r.mood = clamp(r.mood + 2, 0, 100); break;
      case 'play': r.mood = clamp(r.mood + 8, 0, 100); r.energy = clamp(r.energy - 5, 0, 100); break;
      case 'wander': break;
      case 'jobSearch': break;
      case 'football': {
        if (r.matchId) {
          const m = this.matches.find(x => x.id === r.matchId);
          if (m) m.until = Math.min(m.until, this.minute);
          r.matchId = null;
        }
        break;
      }
      case 'investigate': {
        const inc = this.incidents.find(i => i.id === task.incidentId);
        if (inc && !inc.solved) this.resolveIncident(inc, r);
        r.onDuty = true;
        break;
      }
      case 'jail': {
        r.arrestedUntil = 0;
        r.indoors = false;
        this.addLog('police', `${r.name} خرج من الحبس، ودفع الغرامة، ورجع الحارة.`, r);
        break;
      }
      case 'hail': {
        const ride = this.rides.find(x => x.id === task.rideId);
        if (ride && ride.state === 'waiting') {
          ride.state = 'done';
          this.addLog('ride', `${r.name} ملّ من الانتظار ومشي على رجليه.`, r);
        }
        break;
      }
      case 'ride': break;
      case 'patrol': break;
      case 'robbery': break;
      default: break;
    }
    if (r.money < 0) {
      r.money = 0;
      r.mood = clamp(r.mood - 10, 0, 100);
    }

    /* كان جوه البيت؟ لازم يخرج من الباب بالأنيميشن */
    if (wasInside && r.homeId && task.placeId === r.homeId) {
      r.phase = 'exit';
      r.anim = { dir: 'out', t: 0, placeId: r.homeId };
      r.until = null;
      if (place) { r.x = place.door.x; r.y = place.door.y; }
      r.path = [];
    }
  }

  /* ---------- decisions ---------- */
  decide(r) {
    if (this.isLockedUp(r)) {
      r.arrestedUntil = 0;
      r.indoors = false;
    }
    if (r.child) return this.childDecide(r);
    if (r.homeless || !r.homeId) return this.homelessDecide(r);
    const t = this.t;
    const home = this.getPlace(r.homeId);
    const jobPlace = r.workplaceId ? this.getPlace(r.workplaceId) : null;
    const job = jobPlace && jobPlace.jobs && r.jobIndex >= 0 ? jobPlace.jobs[r.jobIndex] : null;

    /* 0 — الجرائم: الحرامي بينزل بالليل بدل ما ينام */
    const crimeTime = r.crimeAt ? this.minute >= r.crimeAt : this.isNightCrimeTime();
    if (r.thief && crimeTime && !r.robbedTonight && !this.isLockedUp(r) && chance(0.8)) {
      r.robbedTonight = true;
      r.crimeAt = 0;
      return chance(0.65) ? this.robHouse(r) : this.robPerson(r);
    }

    /* 0b — الشرطي بيعمل دورية في الشارع */
    if (r.jobTitle === 'شرطي' && t >= 8 * 60 && t < 23 * 60 && chance(0.55)) {
      return this.patrol(r);
    }

    /* 0c — مشوار بعربية بالليل بدل المشي */
    if (t >= 19 * 60 + 30 && t < 23 * 60 && r.money > 90 && this.drivers().length && chance(0.35)) {
      const ride = this.requestRide(r, r.homeId);
      if (ride) return true;
    }

    /* 1 — exhaustion / night */
    if (r.energy < 15) {
      return this.goToPlace(r, home, 'sleep', { duration: 240, thought: this.line(r, 'sleep') });
    }
    if ((t >= 22 * 60 + 30 || t < 5 * 60 + 30) && !this.isAsleep(r)) {
      let untilMorning = Math.max(120, nextAt(this.minute, 6, 40) - this.minute);
      /* الحرامي بيفضل صاحي لحد ميعاد "شغله" */
      if (r.thief && !r.robbedTonight && r.crimeAt && r.crimeAt > this.minute) {
        untilMorning = Math.min(untilMorning, Math.max(20, r.crimeAt - this.minute));
      }
      return this.goToPlace(r, home, 'sleep', { duration: untilMorning, thought: this.line(r, 'sleep'), silent: true });
    }

    /* 2 — work shift */
    if (job) {
      const inShift = t >= job.start - 30 && t <= job.end - 12;
      if (inShift) {
        const dur = Math.max(25, job.end - t);
        return this.goToPlace(r, jobPlace, 'work', {
          duration: dur, wage: job.wage, shiftLen: job.end - job.start,
          thought: this.line(r, 'work'), silent: true,
        });
      }
    }

    /* 3 — bills, then rent */
    if (r.billAmount > 0 && this.day >= r.billDue && r.money >= r.billAmount) {
      return this.goToPlace(r, home, 'bills', { duration: 18, amount: r.billAmount, thought: this.line(r, 'pay'), silent: true });
    }
    if (this.day >= r.rentDue && r.money >= r.rentAmount) {
      return this.goToPlace(r, home, 'rent', { duration: 18, amount: r.rentAmount, thought: this.line(r, 'rent'), silent: true });
    }

    /* 4 — food */
    if (r.hunger > 52) return this.eat(r);
    if (!r.jobTitle && !job && this.availableJobs().length && chance(0.55)) return this.searchJob(r);

    /* 5 — money trouble */
    if (r.money < 55) return this.gig(r);

    /* 5a — عربية من المعرض (بس لو فلوسه تكفي موديل موجود) */
    if (!r.carId && !r.child) {
      const affordable = CAR_MODELS.filter(m => m.price + 300 <= r.money);
      if (affordable.length && chance(0.2)) {
        const car = this.buyCar(r, pick(affordable).id);
        if (car.ok) return this.wander(r);
      }
      /* مفيش كاش كفاية؟ المعرض بيقسّط */
      const financeable = CAR_MODELS.filter(m => Math.round(m.price * CAR_DOWN_RATE) + 200 <= r.money);
      if (financeable.length && r.money > 600 && chance(0.16)) {
        const car = this.buyCar(r, pick(financeable).id, { installment: true });
        if (car.ok) return this.wander(r);
      }
    }

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
    const priceK = this.mod.foodPrice || 1;
    const shops = this.openFoodShops().filter(p => Math.round(p.meal.cost * priceK) <= r.money);
    if (shops.length) {
      shops.sort((a, b) => (b.meal.hunger - b.meal.cost) - (a.meal.hunger - a.meal.cost));
      const place = pick(shops.slice(0, Math.min(3, shops.length)));
      return this.buyFood(r, place);
    }
    return this.eatFree(r);
  }

  eatFree(r) {
    const charity = this.places.find(p => p.kind === 'charity');
    const night = this.t >= 23 * 60 || this.t < 6 * 60;
    if (charity && !night && chance(0.8)) {
      this.addLog('food', `رايح ${charity.name}… مش معاه حق الأكل.`, r);
      return this.goToPlace(r, charity, 'eat', {
        duration: rndInt(30, 45), paid: true,
        meal: { name: 'لقمة عيش', cost: 0, hunger: 46 },
        thought: this.line(r, 'charity'),
      });
    }
    const home = this.getPlace(r.homeId);
    if (!home) {
      const mosque = this.places.find(p => p.style === 'mosque') || charity;
      if (mosque) {
        return this.goToPlace(r, mosque, 'eat', {
          duration: 35, paid: true, meal: { name: 'لقمة من الجامع', cost: 0, hunger: 28 },
          thought: 'مفيش بيت ومفيش فلوس… الجامع بيسدّ.',
        });
      }
      return this.wander(r);
    }
    return this.goToPlace(r, home, 'eat', {
      duration: 40, paid: true, meal: { name: 'حاجة في البيت', cost: 0, hunger: 30 },
      thought: 'مفيش فلوس… هدور على حاجة في البيت.',
    });
  }

  searchJob(r) {
    const slots = this.availableJobs();
    if (!slots.length) return this.wander(r);
    const byPlace = {};
    slots.forEach(s => { byPlace[s.place.id] = s.place; });
    const place = pick(Object.values(byPlace));
    return this.goToPlace(r, place, 'jobSearch', { duration: 25, thought: this.line(r, 'job') });
  }

  gig(r) {
    const spots = this.places.filter(p => ['garage', 'market', 'charity', 'youth', 'veg'].includes(p.id));
    const place = pick(spots.length ? spots : this.places);
    const earn = rndInt(45, 95);
    this.addLog('work', `نزل يدور على يومية في ${place.name}.`, r);
    return this.goToPlace(r, place, 'gig', {
      duration: rndInt(90, 160), earn, thought: this.line(r, 'gig'), silent: true,
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
      thought: this.line(r, 'social'),
      silent: true,
    });
  }

  family(r) {
    const home = this.getPlace(r.homeId);
    return this.goToPlace(r, home, 'family', {
      duration: rndInt(60, 120), thought: this.line(r, 'family'), silent: true,
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
      duration: rndInt(20, 55), thought: this.line(r, 'idle'), silent: true,
    });
  }

  /* ---------- interiors ---------- */
  insideResidents(place) {
    if (!place) return [];
    const out = [];
    for (const r of this.residents) {
      if (r.task && r.task.placeId === place.id) out.push(r);
      else if (place.kind === 'home' && r.homeId === place.id && (!r.task || r.task.kind === 'sleep')) out.push(r);
    }
    return out;
  }

  pickSeat(list, r, seats) {
    const i = Math.max(0, list.indexOf(r));
    const s = seats[i % seats.length];
    return { x: s.x, y: s.y };
  }

  interiorSlot(r, place) {
    if (!r || !place) return null;
    const t = r.task;
    const isWorker = t && t.kind === 'work' && r.workplaceId === place.id;
    if (isWorker) {
      const st = (r.duty && r.duty.state) || 'cook';
      if (st === 'cook') return { x: 0.2, y: 0.52, pose: 'cook' };
      if (st === 'carry') return { x: 0.36, y: 0.58, pose: 'carry' };
      return { x: 0.47, y: 0.5, pose: 'serve' };
    }
    if (t && t.kind === 'buy') {
      const idx = place.queue ? place.queue.indexOf(r.id) : -1;
      if (t.stage === 'queue') return { x: 0.5 + Math.max(0, idx) * 0.075, y: 0.68, pose: 'queue' };
      if (t.stage === 'order') return { x: 0.5, y: 0.64, pose: 'order' };
      if (t.stage === 'pay') return { x: 0.57, y: 0.64, pose: 'pay' };
      if (t.stage === 'eat') {
        const eaters = this.residents.filter(x => x.task && x.task.placeId === place.id && x.task.stage === 'eat');
        const seat = this.pickSeat(eaters, r, EAT_SEATS);
        return { x: seat.x, y: seat.y, pose: 'eat' };
      }
    }
    if (t && (t.kind === 'eat' || t.kind === 'family' || t.kind === 'social')) {
      const list = this.residents.filter(x => x.task && x.task.placeId === place.id);
      const seat = this.pickSeat(list, r, HOME_SEATS);
      return { x: seat.x, y: seat.y, pose: 'eat' };
    }
    if (t && t.kind === 'sleep') {
      if (place.kind === 'home') return { x: 0.86, y: 0.66, pose: 'sleep' };
      return null;
    }
    if (place.kind === 'home') {
      const list = this.residents.filter(x => x.homeId === place.id);
      const seat = this.pickSeat(list, r, HOME_SEATS);
      return { x: seat.x, y: seat.y, pose: 'eat' };
    }
    return { x: 0.62, y: 0.58, pose: 'idle' };
  }

  sideOfShop(place) {
    if (!place) return [];
    return place.queue ? place.queue.map(id => this.getResident(id)).filter(Boolean) : [];
  }

  /* ---------- save / load ---------- */
  serialize() {
    const cleanResident = (r) => {
      const out = {};
      for (const k of Object.keys(r)) {
        if (k.startsWith('_')) continue;
        if (['path', 'micro', 'duty', 'spawnAt', 'speechAt', '_bubbleAt'].includes(k)) continue;
        out[k] = r[k];
      }
      out.spawnAt = 0;
      out.task = null;
      out.phase = 'idle';
      out.until = null;
      out.path = [];
      out.micro = null;
      out.duty = null;
      out.speech = '';
      out.lastLine = '';
      return out;
    };
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      minute: this.minute,
      day: this.day,
      seq: this.seq,
      nextRid: this.nextRid,
      nextHid: this.nextHid,
      nextPid: this.nextPid,
      stats: this.stats,
      mod: this.mod,
      powerCut: this.powerCut,
      events: this.events,
      lastEventDay: this.lastEventDay,
      eventPending: this.eventPending,
      eventAt: this.eventAt,
      places: this.places.map(p => JSON.parse(JSON.stringify(p))),
      residents: this.residents.map(cleanResident),
      households: JSON.parse(JSON.stringify(this.households)),
      projects: JSON.parse(JSON.stringify(this.projects)),
      cars: JSON.parse(JSON.stringify(this.cars)),
      rides: JSON.parse(JSON.stringify(this.rides.filter(r => r.state !== 'done'))),
      incidents: JSON.parse(JSON.stringify(this.incidents.slice(-40))),
      trafficClock: this.trafficClock,
      mayor: {
        treasury: this.mayor.treasury,
        tax: { ...this.mayor.tax },
        taxArrears: { ...this.mayor.taxArrears },
        services: { ...this.mayor.services },
        policeCoverage: this.mayor.policeCoverage,
        leadership: { ...this.mayor.leadership },
        fines: this.mayor.fines.slice(0, 40),
        history: this.mayor.history.slice(0, 30),
        lastCollectDay: this.mayor.lastCollectDay,
        collectedTotal: this.mayor.collectedTotal,
        grantedTotal: this.mayor.grantedTotal,
        nextToken: this.mayor.nextToken,
      },
      timeScale: this.timeScale,
      tutorial: this.tutorial.toJSON(),
      nextCarId: this.nextCarId,
      nextRideId: this.nextRideId,
      nextIncId: this.nextIncId,
      logs: this.logs.slice(-250),
    };
  }

  hydrate(data) {
    const verOk = data && (data.v === SAVE_VERSION || SAVE_VERSION_LEGACY.includes(data.v));
    if (!verOk) return { ok: false, reason: 'نسخة قديمة من الحفظ' };
    this.reset();
    this.started = true;
    this.minute = Number(data.minute) || 7 * 60;
    this.day = Number(data.day) || 1;
    this.seq = Number(data.seq) || 1;
    this.nextRid = Number(data.nextRid) || 1;
    this.nextHid = Number(data.nextHid) || 1;
    this.nextPid = Number(data.nextPid) || 1;
    this.stats = Object.assign({}, this.stats, data.stats || {});
    this.mod = Object.assign({ foodPrice: 1, energyDrain: 1, moodBias: 0, until: 0, name: '' }, data.mod || {});
    this.powerCut = !!data.powerCut;
    this.events = data.events || [];
    this.lastEventDay = data.lastEventDay || 0;
    this.eventPending = !!data.eventPending;
    this.eventAt = data.eventAt || 0;

    this.places = (data.places || []).map(p => {
      const place = Object.assign({}, p);
      place.door = p.door || { x: p.x + p.w / 2, y: p.y + p.h + 20 };
      place.queue = (p.queue || []).filter(Boolean);
      place.households = p.households || [];
      if (place.stockMax == null) place.stockMax = place.meal ? 26 : (place.products ? 30 : 0);
      if (place.stock == null) place.stock = place.stockMax ? 12 : 0;
      if (place.salesToday == null) place.salesToday = 0;
      if (place.ownerId === undefined) place.ownerId = null;
      if (!place.jobs && p.jobs) place.jobs = p.jobs;
      return place;
    });
    this.residents = (data.residents || []).map(r => {
      const out = Object.assign({}, r);
      out.rel = r.rel || {};
      out.quotes = r.quotes || [];
      out.crushes = r.crushes || [];
      out.parents = r.parents || [];
      out.kids = r.kids || [];
      out.task = null;
      out.phase = 'idle';
      out.path = [];
      out.until = null;
      out.micro = null;
      out.duty = null;
      out.spawnAt = 0;
      out.speech = '';
      out._bubbleAt = 0;
      out._seenSpeech = '';
      out.stats = Object.assign({ earned: 0, spent: 0, meals: 0, shifts: 0, served: 0 }, r.stats || {});
      return out;
    });
    this.households = (data.households || []).map(h => Object.assign({ members: [], kids: [] }, h));
    this.projects = (data.projects || []).map(p => Object.assign({ progress: 0 }, p));
    this.cars = (data.cars || []).map(c => Object.assign({ company: false, rides: 0 }, c));
    this.nextCarId = Number(data.nextCarId) || (this.cars.reduce((m, c) => Math.max(m, c.id), 0) + 1);
    this.rides = (data.rides || []).map(r => Object.assign({ state: 'waiting', startedAt: 0 }, r, {
      state: r.state === 'riding' ? 'waiting' : (r.state || 'waiting'),
      driverId: null,
    }));
    this.nextRideId = Number(data.nextRideId) || (this.rides.reduce((m, r) => Math.max(m, r.id), 0) + 1);
    this.incidents = (data.incidents || []).map(i => Object.assign({ solved: false, reported: false }, i));
    this.nextIncId = Number(data.nextIncId) || (this.incidents.reduce((m, i) => Math.max(m, i.id), 0) + 1);
    this.trafficClock = Number(data.trafficClock) || this.minute;
    this.timeScale = Number(data.timeScale) > 0 ? Number(data.timeScale) : 1;
    this.mayor = Object.assign(freshMayorState(), data.mayor || {});
    this.mayor.tax = Object.assign({ resident: 0.05, business: 0.03 }, (data.mayor || {}).tax || {});
    this.mayor.services = Object.assign({ streetlights: true, water: true, police: true }, (data.mayor || {}).services || {});
    this.mayor.leadership = Object.assign({ roleId: 'mayor', playerHolds: true, holderId: null, aiMayor: false }, (data.mayor || {}).leadership || {});
    this.mayor.taxArrears = Object.assign({}, (data.mayor || {}).taxArrears || {});
    this.mayor.fines = ((data.mayor || {}).fines || []).slice();
    this.mayor.history = ((data.mayor || {}).history || []).slice();
    this.pendingConfirms = {};
    this.tutorial = new TutorialEngine(data.tutorial);
    this.applyHomeLooks();
    this.matches = [];
    this.streetGameIn = 60;
    /* كل عربية ليها ساكنها */
    for (const r of this.residents) {
      r.indoors = false;
      r.anim = null;
      r.stuck = 0;
      r.matchId = null;
      r.onDuty = false;
      r.robbedTonight = false;
      r.crimeAt = 0;
      if (r.carDebt && !(r.carDebt.left > 0)) r.carDebt = null;
      if (r.carId && !this.cars.some(c => c.id === r.carId)) r.carId = null;
      if (r.arrestedUntil && r.arrestedUntil < this.minute) r.arrestedUntil = 0;
    }
    this.logs = data.logs || [];
    this.nav = buildNav(this.places);
    this.insideId = null;
    return { ok: true };
  }

  /* ---------- per-frame ---------- */
  update(dt) {
    if (this.tutorial) this.tutorial.tick(this);
    if (!this.started || this.paused) return;
    const real = Math.min(dt, 0.1);
    const simDt = (real * SIM_MIN_PER_SEC * this.speed) / this.timeScale;   /* sim minutes */
    const prevDay = this.day;
    this.minute += simDt;
    this.day = dayNum(this.minute);
    if (this.day !== prevDay) this.newDay();

    if (this.mod.until && this.minute > this.mod.until) {
      this.mod = { foodPrice: 1, energyDrain: 1, moodBias: 0, until: 0, name: '' };
      this.powerCut = false;
    }

    for (const r of this.residents) this.updateResident(r, simDt, real);
    this.growResidents(simDt);
    this.updateProjects(simDt);
    this.updateMatches(simDt);
    this.updateIncidents();
    this.updateRides();
    /* ساعة المرور بتقف لو فيه ماتش كورة في الشارع */
    this.trafficClock += simDt * (this.activeStreetMatch() ? 0.12 : 1);
    /* ماتشات الشارع: العيال بتنزل تلعب في وش العربيات */
    this.streetGameIn -= simDt;
    if (this.streetGameIn <= 0) {
      this.streetGameIn = rndInt(60, 150);
      this.maybeStreetMatch();
    }
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
    /* خدمات الحارة بتأثر على المزاج (نور الشوارع / المايه) */
    if (this.mayor && this.mayor.services) {
      if (this.mayor.services.streetlights === false && (this.t >= 19 * 60 || this.t < 5 * 60) && !r.indoors) {
        r.mood = clamp(r.mood - simDt * 0.004, 0, 100);
      }
      if (this.mayor.services.water === false) {
        r.mood = clamp(r.mood - simDt * 0.0025, 0, 100);
      }
    }

    /* short strolls inside a shop (stove ↔ counter) */
    if (r.micro && !r.anim && !r.indoors) {
      const dx = r.micro.x - r.x, dy = r.micro.y - r.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = 46 * this.speed * real;
      if (dist <= stepLen) {
        r.x = r.micro.x; r.y = r.micro.y; r.micro = null;
      } else {
        r.x += (dx / dist) * stepLen;
        r.y += (dy / dist) * stepLen;
        r.dir = Math.atan2(dy, dx);
      }
    }

    /* دخول/خروج البيوت: الباب بيتفتح، الشخص بيعدّي ويختفي، والباب بيتقفل */
    if (r.anim) {
      r.anim.t += real;
      const half = 0.55;
      if (r.anim.dir === 'in') {
        if (r.anim.t >= half && !r.indoors) r.indoors = true;
        if (r.anim.t >= 1.15) { r.anim = null; r.phase = 'act'; }
      } else {
        if (r.anim.t >= half && r.indoors) r.indoors = false;
        if (r.anim.t >= 1.15) { r.anim = null; r.phase = 'idle'; r.until = null; }
      }
      r.dir = r.dir || 0;
    } else if (r.phase === 'walk') {
      const isRide = r.task && r.task.kind === 'ride';
      const speed = WALK_PX_PER_SEC * (isRide ? 2.3 : 1) * this.speed;
      let dist = speed * real;
      let guard = 0;
      const fromX = r.x, fromY = r.y;
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
      if (!r.path.length) {
        r.stuck = 0;
        this.arrive(r);
      } else {
        /* لو واقف مكانه (زحمة/طريق مقفول) نصلّح الطريق بدل ما يتعلّق */
        if (Math.hypot(r.x - fromX, r.y - fromY) < 0.4) r.stuck = (r.stuck || 0) + simDt;
        else { r.stuck = 0; if (r.repaths && r.repaths > 0) r.repaths = 0; }
        if (r.stuck > 7) this.recoverWalk(r);
      }
    } else {
      r.dir = r.dir || 0;
    }

    /* shop duty (cooking / carrying / serving) and hungry customers */
    if (r.task && r.task.kind === 'work' && r.phase === 'act') this.updateDuty(r);
    if (r.task && r.task.kind === 'buy') this.updateBuyer(r);

    /* activity timer */
    if (r.phase === 'act' && r.until != null && this.minute >= r.until) this.finish(r);
    if (r.phase === 'walk' && r.task) {
      /* if a shift has already ended while walking, give up politely */
      const task = r.task;
      if (task.kind === 'work') {
        const jobPlace = this.getPlace(task.placeId);
        const job = jobPlace && jobPlace.jobs && r.jobIndex >= 0 ? jobPlace.jobs[r.jobIndex] : null;
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
          const rentHome = this.getPlace(r.homeId);
          this.addLog('event', `الإيجار بقى مستحق على ${r.name} (${money(r.rentAmount)})${rentHome ? ' في ' + rentHome.name : ''}.`, r);
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

    /* أقساط العربيات — المعرض بيحصّل كل يوم */
    for (const r of this.residents) {
      const d = r.carDebt;
      if (!d || d.left <= 0) continue;
      if (this.day < d.nextDay) continue;
      const pay = Math.min(d.left, d.daily);
      if (r.money >= pay) {
        r.money -= pay;
        r.stats.spent += pay;
        this.stats.spent += pay;
        d.left -= pay;
        d.nextDay = this.day + 1;
        d.missed = 0;
        if (d.left <= 0) {
          const car = this.cars.find(c => c.id === d.carId);
          r.carDebt = null;
          if (car) car.installment = null;
          this.addLog('money', `${r.name} خلّص آخر قسط في ${car ? car.name : 'عربيته'} — العربية بقت خالصة.`, r);
          this.think(r, 'الحمد لله… العربية بقت بتاعتي من غير دين.');
        }
      } else {
        d.missed = (d.missed || 0) + 1;
        d.nextDay = this.day + 1;
        r.mood = clamp(r.mood - 4, 0, 100);
        if (d.missed === 2) {
          this.addLog('money', `${r.name} اتأخر في قسط العربية — المعرض بيكلمه كل يوم.`, r);
        }
        if (d.missed >= 5 && chance(0.4)) this.think(r, 'قسط العربية… لو ما دبرتش فلوس، المعرض هياخدها.');
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

    this.validateJobs();
    this.ensurePublicJobs();
    this.ageChildren();

    /* العمدة: تحصيل/منح/إسكان — بنفس الأوامر والقيود */
    this.aiMayorTick();
    const arrears = Object.values(this.mayor.taxArrears).reduce((n, v) => n + v, 0);
    if (arrears > 0 && this.day % 3 === 0) {
      this.addLog('mayor', `فيه ${money(arrears)} ضرايب متأخرة على السكان — الخزنة مستنية.`);
    }

    /* ---- يوم جديد: الحرامية بيستنوا ليل جديد، والعربيات بتركن عند البيت ---- */
    for (const r of this.residents) {
      r.robbedTonight = false;
      r.crimeAt = 0;
      if (r.arrestedUntil && r.arrestedUntil <= this.minute) { r.arrestedUntil = 0; r.indoors = false; }
      if (r.carId) {
        const car = this.carOf(r);
        if (car) { car.parkedAt = r.homeId; car.parkAt = this.parkingSpot(this.getPlace(r.homeId)); }
      }
    }
    /* أقفال جديدة للبيوت اللي اتسرقت */
    for (const home of this.places.filter(p => p.kind === 'home')) {
      if ((home.security || 1) >= 3) continue;
      const recent = this.incidents.some(i => i.homeId === home.id && this.day - dayNum(i.at) <= 2);
      if (!recent) continue;
      const tenants = this.residents.filter(r => r.homeId === home.id && r.money > 220);
      if (!tenants.length || !chance(0.6)) continue;
      const payer = tenants[0];
      payer.money -= 140;
      payer.stats.spent += 140;
      this.stats.spent += 140;
      home.security = clamp((home.security || 1) + 1, 1, 3);
      this.addLog('police', `${payer.name} ركّب قفل جديد على باب ${home.name} بعد السرقة (${money(140)}).`, payer);
    }

    /* love, marriage and children */
    this.tryMarriages();
    this.tryChildren();
    this.moveOutGrownKids();
    this.maybeNpcBuilding();

    /* pocket money for the kids */
    for (const kid of this.residents.filter(x => x.child)) {
      const parent = this.getResident(kid.parents[0]) || this.getResident(kid.parents[1]);
      if (!parent || parent.money < 40) continue;
      if (!chance(0.5)) continue;
      const amount = rndInt(4, 12);
      parent.money -= amount;
      kid.money += amount;
      if (chance(0.25)) this.addLog('money', `ادّى ${kid.name} مصروف ${money(amount)}.`, parent);
    }

    /* ---- ليل الحارة: فيه حرامي بيخطط لسرقة الليلة ---- */
    const thieves = this.residents.filter(r => r.thief && !r.child && !this.isLockedUp(r));
    if (thieves.length && chance(0.6)) {
      const th = pick(thieves);
      th.robbedTonight = false;
      th.crimeAt = this.minute + rndInt(20 * 60, 25 * 60 + 30);
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


  /* ============================================================
     الليل والنوم
     ============================================================ */
  isAsleep(r) {
    return !!(r && r.indoors && r.homeId && r.task &&
      r.task.kind === 'sleep' && r.phase === 'act' && r.task.placeId === r.homeId);
  }

  isLockedUp(r) { return r && r.arrestedUntil > this.minute; }

  everyoneAsleep() {
    return this.residents.length > 0 && this.residents.every(r => this.isAsleep(r) || this.isLockedUp(r));
  }

  whereIs(r) {
    if (this.isLockedUp(r)) return 'في الحبس';
    const p = r.task ? this.getPlace(r.task.placeId) : null;
    if (!p) return 'في الشارع';
    if (r.indoors) return `جوه ${p.name}`;
    if (r.phase === 'walk') return `في السكة ناحية ${p.name}`;
    return `قصاد ${p.name}`;
  }

  whyAwake(r) {
    if (this.isLockedUp(r)) return 'محبوس';
    if (!r.task) return 'واقف في الشارع بلا شغل';
    if (r.phase === 'walk') return 'لسه راجع البيت';
    const map = {
      work: 'لسه في الشغل', buy: 'بيشتري أكل', eat: 'بياكل', social: 'قاعد مع الناس',
      family: 'قاعد مع العيلة', gig: 'شغال يومية', ride: 'في مشوار بعربية',
      football: 'بيلعب كورة', investigate: 'بيحقّق في حادثة', robbery: 'بيدور على حاجة يسرقها',
      shop: 'بيشتسوق', wander: 'ماشي في الشارع', school: 'في المدرسة', play: 'بيلعب',
      hail: 'مستني عربية تاكسي', bills: 'بيدفع فاتورة', rent: 'بيدفع إيجار',
      jail: 'في الحبس', patrol: 'في دورية', jobSearch: 'بيدور على شغل',
    };
    return map[r.task.kind] || 'لسه صاحي';
  }

  awakeList() {
    return this.residents
      .filter(r => !this.isAsleep(r) && !this.isLockedUp(r))
      .map(r => ({ id: r.id, name: r.name, where: this.whereIs(r), why: this.whyAwake(r) }));
  }

  /* كل الحارة نايمة؟ لو أيوة: نطوّل الوقت لحد الصبح ونصحّي الناس */
  skipNight() {
    if (!this.started) return { ok: false, reason: 'الحارة لسه ما اتولدتش', awake: [] };
    const t = this.t;
    if (t < 20 * 60 && t >= 6 * 60) {
      return { ok: false, reason: 'مش وقت النوم — استنى بالليل', awake: this.awakeList() };
    }
    const awake = this.awakeList();
    if (!this.everyoneAsleep()) {
      return { ok: false, reason: 'فيه ناس لسه صاحية', awake };
    }
    const from = this.minute;
    const target = nextAt(this.minute, 6, 40);
    const skipped = target - from;
    const prevDay = this.day;
    this.minute = target;
    this.day = dayNum(this.minute);
    for (const r of this.residents) {
      if (r.task && r.task.kind === 'sleep') {
        r.energy = clamp(r.energy + skipped * 0.155, 0, 100);
        this.finish(r);
      }
    }
    this.stats.skips = (this.stats.skips || 0) + 1;
    this.addLog('system', `طوّلت الليل لحد الصبح — ${ar(Math.round(skipped / 60))} ساعة عدّوا والناس صحيت من النوم.`);
    if (this.day !== prevDay) this.newDay();
    this.toast('الصبح جه… الحارة صحيت ☀');
    return { ok: true, from, to: this.minute, skipped };
  }

  /* ---------- استرجاع من مشاكل الطريق ---------- */
  recoverWalk(r) {
    const task = r.task;
    if (!task) { r.phase = 'idle'; r.path = []; return; }
    const place = this.getPlace(task.placeId);
    if (!place) { r.task = null; r.phase = 'idle'; r.stuck = 0; r.repaths = 0; return; }
    if ((r.repaths || 0) < 2) {
      r.repaths = (r.repaths || 0) + 1;
      r.stuck = 0;
      r.path = this.pathTo(r, { x: place.door.x + r.jitter.x, y: place.door.y + r.jitter.y });
      this.addLog('system', `${r.name} لقى الطريق مقفول ورجع غيّر سكته ناحية ${place.name}.`, r);
      return;
    }
    /* آخر حل: نوصّله لباب المكان بدل ما يفضل واقف في الشارع */
    r.x = clamp(place.door.x + r.jitter.x, 10, WORLD.w - 10);
    r.y = clamp(place.door.y + r.jitter.y, 10, WORLD.h - 10);
    r.path = [];
    r.stuck = 0;
    r.repaths = 0;
    this.addLog('system', `${r.name} كان تايه في الشوارع… وصل ${place.name} أخيراً.`, r);
    this.arrive(r);
  }

  /* ============================================================
     الكورة: kids + ملعب + شارع
     ============================================================ */
  streetSpots() {
    /* كورة في نص الطريق الأفقي — العربيات بتقف تستنى */
    return [
      { x: 300, y: 410, w: 104, h: 44 },
      { x: 985, y: 410, w: 104, h: 44 },
    ];
  }

  activeStreetMatch() {
    return this.matches.find(m => m.street && m.until > this.minute) || null;
  }

  openMatches(placeId) {
    return this.matches.filter(m => m.until > this.minute && (!placeId || m.placeId === placeId));
  }

  startMatch(placeId) {
    const place = placeId ? this.getPlace(placeId) : null;
    const spot = place
      ? { x: place.x + place.w / 2, y: place.y + place.h / 2 - 6, w: place.w - 30, h: place.h - 26 }
      : pick(this.streetSpots());
    if (!place && this.activeStreetMatch()) return null;
    const pool = this.residents.filter(r => r.child && !r.matchId &&
      (!r.task || (r.task.kind === 'play' && (!placeId || r.task.placeId === placeId))));
    if (pool.length < 2) return null;
    const players = pool.slice(0, Math.min(6, pool.length));
    const m = {
      id: this.nextMatchId++,
      placeId: placeId || null,
      street: !placeId,
      area: { x: spot.x - spot.w / 2, y: spot.y - spot.h / 2, w: spot.w, h: spot.h },
      ball: { x: spot.x, y: spot.y },
      target: null,
      players: players.map(p => p.id),
      scoreA: 0, scoreB: 0,
      startedAt: this.minute,
      until: this.minute + rndInt(45, 85),
      nextPass: this.minute + 1.5,
    };
    this.matches.push(m);
    for (const p of players) {
      p.matchId = m.id;
      p.matchSide = players.indexOf(p) % 2;
      p.task = { kind: 'football', placeId: placeId || null, duration: m.until - this.minute };
      p.phase = 'act';
      p.until = m.until;
      p.path = [];
      p.mood = clamp(p.mood + 6, 0, 100);
      p.x = spot.x + rnd(-24, 24);
      p.y = spot.y + rnd(-14, 14);
    }
    const where = place ? place.name : 'وسط الشارع';
    this.addLog('match', `ماتش كورة بدأ ${place ? 'في' : 'في'} ${where}: ${players.map(p => p.name.split(' ')[0]).join(' و')}… يلا نشوف مين هيكسب.`, players[0]);
    return m;
  }

  updateMatches(simDt) {
    for (const m of this.matches.slice()) {
      if (m.until <= this.minute) { this.finishMatch(m); continue; }
      const a = m.area;
      const alive = m.players.map(id => this.getResident(id)).filter(p => p && p.matchId === m.id);
      if (alive.length < 2) { m.until = this.minute; this.finishMatch(m); continue; }

      /* الكورة بتتحرك ناحية هدف، وبعدها باص لناحية تانية */
      if (!m.target) this.pickBallTarget(m);
      const b = m.ball;
      const dx = m.target.x - b.x, dy = m.target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = 6.4 * simDt;                       /* px per sim-minute */
      if (d <= step) {
        b.x = m.target.x; b.y = m.target.y;
        if (m.target.goal) this.scoreGoal(m);
        this.pickBallTarget(m);
      } else {
        b.x += (dx / d) * step;
        b.y += (dy / d) * step;
      }

      /* اللاعبين بيجروا ورا الكورة (والحراس قريبين من الجون) */
      alive.forEach((p, i) => {
        const side = p.matchSide || 0;
        const keep = (i === 0) ? 0 : 1;
        let tx = b.x, ty = b.y;
        if (keep === 0) {
          tx = side ? a.x + a.w - 12 : a.x + 12;
          ty = a.y + a.h / 2;
        } else {
          tx = b.x + Math.cos(i * 2.1) * 16;
          ty = b.y + Math.sin(i * 2.1) * 11;
        }
        const pdx = tx - p.x, pdy = ty - p.y;
        const pd = Math.hypot(pdx, pdy) || 1;
        const psp = 3.4 * simDt;
        if (pd > 3) {
          p.x += (pdx / pd) * Math.min(psp, pd);
          p.y += (pdy / pd) * Math.min(psp, pd);
          p.dir = Math.atan2(pdy, pdx);
        }
      });
    }
  }

  pickBallTarget(m) {
    const a = m.area;
    const goalSide = chance(0.5) ? -1 : 1;
    const wantGoal = chance(0.42);
    if (wantGoal) {
      m.target = { x: goalSide < 0 ? a.x + 6 : a.x + a.w - 6, y: a.y + a.h / 2 + rnd(-12, 12), goal: true };
    } else {
      m.target = { x: a.x + 12 + Math.random() * (a.w - 24), y: a.y + 8 + Math.random() * (a.h - 16) };
    }
  }

  scoreGoal(m) {
    const side = m.target.x < m.area.x + m.area.w / 2 ? 'B' : 'A';
    if (side === 'A') m.scoreA++; else m.scoreB++;
    m.nextPass = this.minute + 2;
    this.stats.goals = (this.stats.goals || 0) + 1;
    const scorer = this.getResident(pick(m.players));
    this.fx('goal', m.ball.x, m.ball.y, '⚽ جـون!');
    if (scorer) this.think(scorer, this.line(scorer, 'scored'));
    if (chance(0.65)) {
      const p = this.getPlace(m.placeId);
      this.addLog('match', `جووون في ${p ? p.name : 'الشارع'}! النتيجة ${ar(m.scoreA)}–${ar(m.scoreB)}.`, scorer);
    }
  }

  finishMatch(m) {
    m.until = this.minute - 1;
    for (const id of m.players) {
      const p = this.getResident(id);
      if (!p || p.matchId !== m.id) continue;
      p.matchId = null;
      if (p.task && p.task.kind === 'football') { p.task = null; p.phase = 'idle'; p.until = null; }
      p.mood = clamp(p.mood + (m.scoreA + m.scoreB > 0 ? 8 : 3), 0, 100);
      p.energy = clamp(p.energy - 6, 0, 100);
    }
    this.matches = this.matches.filter(x => x.id !== m.id);
    this.addLog('match', `خلص ماتش ${this.getPlace(m.placeId) ? this.getPlace(m.placeId).name : 'الشارع'}: ${ar(m.scoreA)}–${ar(m.scoreB)}. العيال رجعوا يجروا.`);
  }

  joinMatch(r) {
    const open = this.openMatches().find(m => m.players.length < 6 && !m.players.includes(r.id));
    if (!open) {
      const started = this.startMatch(this.getPlace('pitch') ? 'pitch' : null);
      if (!started) return null;
      this.stats.matches = (this.stats.matches || 0) + 1;
      return started.players.includes(r.id) ? started : null;
    }
    this.stats.matches = (this.stats.matches || 0) + 1;
    open.players.push(r.id);
    r.matchId = open.id;
    r.matchSide = open.players.length % 2;
    r.task = { kind: 'football', placeId: open.placeId, duration: open.until - this.minute };
    r.phase = 'act';
    r.until = open.until;
    r.path = [];
    return open;
  }

  maybeStreetMatch() {
    const t = this.t;
    if (t < 15 * 60 || t > 19 * 60 + 30) return null;
    if (this.activeStreetMatch() || this.matches.length >= 2) return null;
    const freeKids = this.residents.filter(r => r.child && !r.matchId && !r.indoors &&
      (!r.task || ['play', 'wander', 'social', 'football'].includes(r.task.kind))).length;
    if (freeKids < 2 || !chance(0.6)) return null;
    const m = this.startMatch(null);
    if (m) {
      this.addLog('match', 'العيال نزّلوا كورة في نص الشارع… والعربيات واقفة تستنى 📣', null);
    }
    return m;
  }

  /* ============================================================
     الشرطة والجرائم
     ============================================================ */
  policeStation() { return this.getPlace('police'); }
  officers() { return this.residents.filter(r => r.jobTitle === 'شرطي' || r.jobTitle === 'دورية'); }
  homeSecurity(home) { return (home && home.security) || 1; }
  openIncidents() { return this.incidents.filter(i => !i.solved); }

  isNightCrimeTime() {
    const t = this.t;
    return t >= 22 * 60 + 30 || t < 4 * 60 + 30;
  }

  witnessesNear(x, y, exceptId, radius = 230) {
    return this.residents.filter(r => r.id !== exceptId && !r.indoors &&
      Math.hypot(r.x - x, r.y - y) < radius).slice(0, 4);
  }

  robHouse(r) {
    const homes = this.places.filter(p => p.kind === 'home' && p.id !== r.homeId &&
      this.residents.some(o => o.homeId === p.id && o.id !== r.id && o.money > 25));
    if (!homes.length) return this.wander(r);
    const home = pick(homes);
    const victims = this.residents.filter(o => o.homeId === home.id && o.id !== r.id);
    const victim = pick(victims) || null;
    return this.goToPlace(r, home, 'robbery', {
      duration: 10, victimId: victim ? victim.id : null,
      thought: pick(['الباب مفتوح… الفرصة جت.', 'أي حاجة تتحرك… لأ، الدنيا ساكتة.', 'لو الحارس صحى، أنا في داهية.']),
      silent: true,
    });
  }

  commitRobbery(thief, home) {
    const victims = this.residents.filter(o => o.homeId === home.id && o.id !== thief.id && o.money > 10);
    if (!victims.length) {
      this.addLog('crime', `${thief.name} لف حوالين ${home.name}… مفيش حاجة تسرقها ورجع.`, thief);
      return false;
    }
    const victim = pick(victims);
    const coverage = this.mayor.policeCoverage || 'normal';
    const officersNear = this.officers().some(o => Math.hypot(o.x - home.door.x, o.y - home.door.y) < (coverage === 'high' ? 420 : coverage === 'low' ? 150 : 260) && o.onDuty);
    const security = this.homeSecurity(home);
    const busted = chance(0.03 + security * 0.05 + (officersNear ? 0.55 : 0));
    const amount = Math.min(victim.money, rndInt(70, 240));
    const witnesses = this.witnessesNear(home.door.x, home.door.y, thief.id, 260);

    if (busted) {
      this.raiseAlarm({ type: 'theft', homeId: home.id, thiefId: thief.id, victimId: victim.id, amount: 0, caught: true, witnesses, at: this.minute });
      this.arrest(thief, `${thief.name} اتقبض عليه وهو بيحاول يسرق ${home.name} — الفلوس رجعت لصاحبها.`);
      return false;
    }

    thief.money += amount;
    thief.stats.earned += amount;
    victim.money -= amount;
    victim.mood = clamp(victim.mood - 18, 0, 100);
    victim.hunger = clamp(victim.hunger + 4, 0, 100);
    home.security = clamp(security, 1, 3);
    const inc = this.raiseAlarm({
      type: 'theft', homeId: home.id, thiefId: thief.id, victimId: victim.id,
      amount, caught: false, witnesses, at: this.minute,
      x: home.door.x, y: home.door.y,
    });
    this.addLog('crime', `🚨 سرقة في ${home.name}: حد دخل على ${victim.name} وخد ${money(amount)} من الشقة.`,
      thief);
    this.think(victim, this.line(victim, 'robbed'));
    if (witnesses.length) {
      this.addLog('police', `شهود: ${witnesses.map(w => w.name).join('، ')} شافوا حاجة غريبة حوالين ${home.name}.`, witnesses[0]);
      inc.reported = true;
      inc.reportedAt = this.minute;
    }
    return true;
  }

  robPerson(thief) {
    const targets = this.residents.filter(o => o.id !== thief.id && !o.indoors && o.money > 60 && !this.officers().includes(o));
    if (!targets.length) return this.wander(thief);
    const victim = pick(targets);
    return this.goToPlace(thief, this.getPlace(victim.task && victim.task.placeId) || this.getPlace(thief.homeId), 'robbery', {
      duration: 6, victimId: victim.id, person: true, silent: true,
      thought: 'الراجل ده لوحده… والشارع فاضي.',
    });
  }

  commitMugging(thief, victim) {
    if (!victim || victim.money < 20) return false;
    const amount = Math.min(victim.money, rndInt(25, 90));
    const busted = this.officers().some(o => o.onDuty && Math.hypot(o.x - thief.x, o.y - thief.y) < 190);
    const witnesses = this.witnessesNear(thief.x, thief.y, thief.id, 200);
    if (busted) {
      this.raiseAlarm({ type: 'mugging', thiefId: thief.id, victimId: victim.id, amount: 0, caught: true, witnesses, at: this.minute });
      this.arrest(thief, `${thief.name} اتقبض عليه وهو بيحاول ياخد فلوس ${victim.name} في الشارع.`);
      return false;
    }
    thief.money += amount;
    victim.money -= amount;
    victim.mood = clamp(victim.mood - 14, 0, 100);
    const inc = this.raiseAlarm({
      type: 'mugging', thiefId: thief.id, victimId: victim.id, amount,
      caught: false, witnesses, at: this.minute, x: thief.x, y: thief.y,
    });
    this.addLog('crime', `🚨 ${victim.name} اتحايل عليه في الشارع — حد خد منه ${money(amount)} وجري.`, victim);
    this.think(victim, this.line(victim, 'mugged'));
    if (witnesses.length) {
      inc.reported = true;
      inc.reportedAt = this.minute;
      this.addLog('police', `${witnesses[0].name} شاف اللي حصل وجري على القسم يبلّغ.`, witnesses[0]);
    }
    return true;
  }

  raiseAlarm(data) {
    const inc = Object.assign({
      id: this.nextIncId++, reported: false, reportedAt: 0, solved: false,
      officerId: null, assignedAt: 0, cold: false, recovered: 0,
    }, data);
    /* الشهود كـ ids بس — السجل مايتخمش بالكامل */
    if (Array.isArray(inc.witnesses)) {
      inc.witnessIds = inc.witnesses.map(w => w.id);
      delete inc.witnesses;
    }
    this.incidents.push(inc);
    if (this.incidents.length > 40) this.incidents.shift();
    if (!inc.reported) {
      /* الضحية بتكتشف الصبح */
      const victim = inc.victimId ? this.getResident(inc.victimId) : null;
      inc.discoverAt = victim ? nextAt(this.minute, 7, 10) : this.minute + 30;
    }
    return inc;
  }

  arrest(thief, text) {
    if (!thief) return;
    const release = nextAt(this.minute, 8, 0);
    thief.arrestedUntil = release;
    thief.record = (thief.record || 0) + 1;
    thief.task = { kind: 'jail', placeId: 'police', duration: Math.max(30, release - this.minute) };
    thief.phase = 'act';
    thief.indoors = true;
    thief.until = release;
    thief.x = this.policeStation() ? this.policeStation().door.x : thief.x;
    thief.y = this.policeStation() ? this.policeStation().door.y : thief.y;
    thief.mood = clamp(thief.mood - 20, 0, 100);
    thief.path = [];
    this.stats.arrests = (this.stats.arrests || 0) + 1;
    this.addLog('police', `🚓 ${text}`, thief);
    this.toast('الشرطة قبضت على واحد');
  }

  dispatchOfficer(inc) {
    const station = this.policeStation();
    if (!station) return null;
    if (this.mayor.services && this.mayor.services.police === false) return null;
    /* تغطية خفيفة = دوريات أقل */
    if (this.mayor.policeCoverage === 'low' && chance(0.45)) return null;
    const free = this.officers().filter(o => !this.isLockedUp(o) && (!o.task || o.task.kind !== 'investigate'));
    if (!free.length) return null;
    free.sort((a, b) => Math.hypot(a.x - station.door.x, a.y - station.door.y) - Math.hypot(b.x - station.door.x, b.y - station.door.y));
    const officer = free[0];
    const target = inc.homeId ? this.getPlace(inc.homeId) : this.getPlace('police');
    if (!target) return null;
    officer.onDuty = true;
    if (officer.indoors || officer.anim) { officer.indoors = false; officer.anim = null; }
    officer.task = { kind: 'investigate', placeId: target.id, incidentId: inc.id, duration: 18, silent: true };
    officer.phase = 'walk';
    officer.until = null;
    officer.path = this.pathTo(officer, { x: target.door.x + rnd(-14, 14), y: target.door.y + rnd(4, 14) });
    inc.officerId = officer.id;
    inc.assignedAt = this.minute;
    this.addLog('police', `🚓 ${officer.name} اتحرك على ${target.name} بعد بلاغ سرقة.`, officer);
    return officer;
  }

  resolveIncident(inc, officer) {
    if (inc.solved) return true;
    inc.investigatedAt = this.minute;
    const thief = inc.thiefId ? this.getResident(inc.thiefId) : null;
    /* اتقبض عليه في اللحظة — القضية خلصت من غير دورية */
    if (inc.caught) {
      inc.solved = true;
      inc.solvedAt = this.minute;
      inc.note = 'اتقبض عليه في اللحظة';
      if (officer) this.think(officer, 'الحالة اتقفلت قبل ما أوصل… تمام.');
      return true;
    }
    const delay = this.minute - inc.at;
    let catchChance = 0.34 + (delay < 90 ? 0.22 : 0) + (thief ? Math.min(0.2, thief.record * 0.08) : 0);
    if (officer) catchChance += 0.12;
    if (inc.caught) catchChance = 1;
    if (thief && !this.isLockedUp(thief) && chance(catchChance)) {
      const victim = inc.victimId ? this.getResident(inc.victimId) : null;
      const back = Math.min(thief.money, inc.amount);
      if (back > 0) {
        thief.money -= back;
        inc.recovered = back;
        if (victim) {
          victim.money += back;
          victim.mood = clamp(victim.mood + 12, 0, 100);
          this.think(victim, 'رجعت الفلوس… الحمد لله.');
        }
        if ((this.stats.recovered || 0) + back > 0) this.stats.recovered = (this.stats.recovered || 0) + back;
        this.addLog('police', `الشرطة رجّعت ${money(back)} لـ${victim ? victim.name : 'صاحب البيت'}.`, officer);
      }
      inc.solved = true;
      inc.solvedAt = this.minute;
      this.arrest(thief, `${thief.name} اتقبض عليه في قضية ${this.getPlace(inc.homeId) ? this.getPlace(inc.homeId).name : 'سرقة'}.`);
      return true;
    }
    inc.cold = true;
    inc.solved = false;
    this.addLog('police', `الشرطة عملت معاينة في ${this.getPlace(inc.homeId) ? this.getPlace(inc.homeId).name : 'مكان الجريمة'}… مفيش دليل واضح، القضية اتأجلت.`, officer);
    if (officer) this.think(officer, this.line(officer, 'officerCase'));
    return false;
  }

  updateIncidents() {
    for (const inc of this.incidents) {
      if (inc.solved) continue;
      /* ضحية مش موجودة؟ اقفل القضية بهدوء */
      if (!inc.reported && inc.discoverAt && this.minute >= inc.discoverAt) {
        inc.reported = true;
        inc.reportedAt = this.minute;
        const victim = inc.victimId ? this.getResident(inc.victimId) : null;
        if (victim) {
          this.addLog('police', `${victim.name} اكتشف السرقة الصبح ونزل بلّغ القسم.`, victim);
        }
      }
      if (inc.reported && !inc.officerId && this.minute - inc.reportedAt < 240) {
        this.dispatchOfficer(inc);
      }
      if (inc.cold && this.day - dayNum(inc.at) >= 2 && chance(0.004)) {
        this.resolveIncident(inc, null);
      }
    }
  }

  patrol(r) {
    const station = this.policeStation();
    const spots = this.places.filter(p => ['social', 'food'].includes(p.kind));
    const target = pick(spots) || station;
    return this.goToPlace(r, target, 'patrol', { duration: rndInt(25, 50), silent: true });
  }

  /* ============================================================
     العمدة: إدارة الحارة (ضرايب، خزنة، إسكان، غرامات، خدمات)
     كل حاجة بتمر من نفس الأوامر والصلاحيات — للّاعب وللعمدة الآلي
     ============================================================ */
  mayorRole() { return MAYOR_ROLES[this.mayor.leadership.roleId] || null; }

  hasPermission(perm) {
    const role = this.mayorRole();
    return !!(role && role.permissions.includes(perm));
  }

  leaderLabel() {
    if (this.mayor.leadership.playerHolds) return 'انت (الخالق)';
    const r = this.getResident(this.mayor.leadership.holderId);
    return r ? r.name : 'مجلس الحارة';
  }

  /* دخل الساكن التقريبي في اليوم */
  incomeOf(r) {
    if (!r) return 0;
    if (r.child) return 0;
    if (r.jobTitle) {
      const place = this.getPlace(r.workplaceId);
      const job = place && place.jobs && r.jobIndex >= 0 ? place.jobs[r.jobIndex] : null;
      if (job && job.wage) return job.wage;
      return 120;
    }
    return 70;
  }

  taxDueOf(r) { return Math.max(0, Math.round(this.incomeOf(r) * (this.mayor.tax.resident || 0))); }

  homeOf(r) { return r && r.homeId ? this.getPlace(r.homeId) : null; }

  homelessResidents() {
    return this.residents.filter(r => !r.child && (!r.homeId || r.homeless));
  }

  /* ساكن في بيت مش بتاعه؟ (متطفّل) */
  isIllegalOccupant(r) {
    if (!r) return false;
    if (r.squatting) return true;
    const home = this.homeOf(r);
    if (!home || home.kind !== 'home') return false;
    const hh = this.householdOf(r);
    if (hh) return hh.homeId !== home.id;
    return false;
  }

  violationsOf(r) {
    const out = [];
    if (!r) return out;
    const home = this.homeOf(r);
    if (this.isIllegalOccupant(r)) {
      out.push({ code: 'trespass', label: 'ساكن بدون حق', detail: home ? `في ${home.name}` : 'بلا سكن' });
    }
    if (!r.homeId && !r.child) out.push({ code: 'homeless', label: 'بلا مأوى', detail: 'محتاج سكن' });
    if ((this.mayor.taxArrears[r.id] || 0) > 0) {
      out.push({ code: 'tax-arrears', label: 'ضرايب متأخرة', detail: money(this.mayor.taxArrears[r.id]) });
    }
    if (home && r.rentDue <= this.day && r.money < (r.rentAmount || 0)) {
      out.push({ code: 'rent-arrears', label: 'إيجار متأخر', detail: money(r.rentAmount || 0) });
    }
    const unpaidFines = this.mayor.fines.filter(f => f.rid === r.id && f.left > 0);
    if (unpaidFines.length) {
      out.push({ code: 'fines', label: 'غرامات غير مدفوعة', detail: money(unpaidFines.reduce((n, f) => n + f.left, 0)) });
    }
    if ((r.record || 0) > 0) out.push({ code: 'record', label: 'سابقة', detail: `${ar(r.record)} في القسم` });
    return out;
  }

  /* ---------- أوامر العمدة ---------- */
  command(id, args = {}, opts = {}) {
    const cmd = MAYOR_COMMANDS[id];
    if (!cmd) return { ok: false, reason: 'أمر غير معروف' };
    if (!this.hasPermission(cmd.permission)) {
      return { ok: false, reason: 'الأمر ده مش من صلاحياتك دلوقتي' };
    }
    if (cmd.confirm && !args.confirm && !opts.ai) {
      const preview = this.commandPreview(id, args);
      if (!preview.ok) return preview;
      const token = this.mayor.nextToken++;
      this.pendingConfirms = this.pendingConfirms || {};
      this.pendingConfirms[token] = { id, args, at: this.minute };
      this.pruneConfirms();
      return { ok: false, needsConfirm: true, token, preview: preview.text, danger: !!cmd.danger };
    }
    if (!opts.ai && args.confirm && args.token != null) {
      const pending = (this.pendingConfirms || {})[args.token];
      if (!pending || pending.id !== id) return { ok: false, reason: 'التأكيد مش صالح — جرّب تاني' };
      delete this.pendingConfirms[args.token];
      if (this.minute - pending.at > CONFIRM_TTL) return { ok: false, reason: 'التأكيد قديم — جرّب تاني' };
    }
    return this.runCommand(id, args, opts);
  }

  pruneConfirms() {
    if (!this.pendingConfirms) return;
    const cutoff = this.minute - CONFIRM_TTL;
    for (const [token, p] of Object.entries(this.pendingConfirms)) {
      if (p.at < cutoff) delete this.pendingConfirms[token];
    }
  }

  /* معاينة قبل التنفيذ: نص واضح للمستخدم + تحقق مبكر */
  commandPreview(id, args) {
    const who = args.residentId ? this.getResident(args.residentId) : null;
    switch (id) {
      case 'tax.set': {
        const rd = Number(args.resident);
        const bd = Number(args.business);
        if (!isFinite(rd) || !isFinite(bd)) return { ok: false, reason: 'نسبة غير صالحة' };
        if (rd < TAX_LIMITS.resident[0] || rd > TAX_LIMITS.resident[1]) return { ok: false, reason: `ضريبة السكان لازم بين ٠٪ و${ar(Math.round(TAX_LIMITS.resident[1] * 100))}٪` };
        if (bd < TAX_LIMITS.business[0] || bd > TAX_LIMITS.business[1]) return { ok: false, reason: `ضريبة الأنشطة لازم بين ٠٪ و${ar(Math.round(TAX_LIMITS.business[1] * 100))}٪` };
        return { ok: true, text: `تحويل ضريبة السكان من ${ar(Math.round(this.mayor.tax.resident * 100))}٪ لـ${ar(Math.round(rd * 100))}٪، والأنشطة من ${ar(Math.round(this.mayor.tax.business * 100))}٪ لـ${ar(Math.round(bd * 100))}٪؟` };
      }
      case 'treasury.grant': {
        if (!who) return { ok: false, reason: 'اختار ساكن' };
        const amount = Math.round(Number(args.amount));
        if (!isFinite(amount) || amount <= 0) return { ok: false, reason: 'المبلغ لازم يكون أكبر من صفر' };
        if (amount > this.mayor.treasury) return { ok: false, reason: `الخزنة فيها ${money(this.mayor.treasury)} بس` };
        return { ok: true, text: `منح ${money(amount)} من خزنة الحارة لـ${who.name}؟` };
      }
      case 'housing.evict': {
        if (!who) return { ok: false, reason: 'اختار ساكن' };
        const home = this.homeOf(who);
        if (!home) return { ok: false, reason: `${who.name} مش ساكن في بيت` };
        return { ok: true, text: `طرد ${who.name} من ${home.name}؟` };
      }
      case 'housing.reassign': {
        if (!who) return { ok: false, reason: 'اختار ساكن' };
        const target = this.getPlace(args.homeId);
        if (!target || target.kind !== 'home') return { ok: false, reason: 'اختار بيت' };
        return { ok: true, text: `نقل ${who.name} من ${this.homeOf(who) ? this.homeOf(who).name : 'بلا مأوى'} لـ${target.name}؟` };
      }
      case 'resident.fine': {
        if (!who) return { ok: false, reason: 'اختار ساكن' };
        const amount = Math.round(Number(args.amount));
        if (!isFinite(amount) || amount <= 0) return { ok: false, reason: 'الغرامة لازم تكون أكبر من صفر' };
        if (amount > FINE_LIMIT) return { ok: false, reason: `أقصى غرامة ${money(FINE_LIMIT)}` };
        return { ok: true, text: `غرامة ${money(amount)} على ${who.name}${args.reason ? ' — ' + args.reason : ''}؟` };
      }
      case 'resident.removeTrespasser': {
        if (!who) return { ok: false, reason: 'اختار ساكن' };
        const home = this.homeOf(who);
        return { ok: true, text: `إخراج ${who.name} من ${home ? home.name : 'البيت'}؟` };
      }
      default:
        return { ok: true, text: MAYOR_COMMANDS[id].label };
    }
  }

  runCommand(id, args = {}, opts = {}) {
    switch (id) {
      case 'tax.set': return this.opSetTax(args);
      case 'treasury.collect': return this.opCollectTaxes(args);
      case 'treasury.grant': return this.opGrant(args);
      case 'housing.evict': return this.opEvict(args);
      case 'housing.reassign': return this.opReassign(args);
      case 'housing.rentals': return this.opRentals(args);
      case 'resident.fine': return this.opFine(args);
      case 'resident.removeTrespasser': return this.opRemoveTrespasser(args);
      case 'service.toggle': return this.opService(args);
      case 'police.coverage': return this.opCoverage(args);
      case 'leader.auto': return this.opLeaderAuto(args);
      default: return { ok: false, reason: 'أمر غير معروف' };
    }
  }

  mayorLog(text, r = null) {
    this.mayor.history.unshift({ day: this.day, minute: this.minute, text });
    if (this.mayor.history.length > 60) this.mayor.history.pop();
    this.addLog('mayor', `🏛️ ${text}`, r);
  }

  opSetTax(args) {
    const rd = Number(args.resident);
    const bd = Number(args.business);
    const chk = this.commandPreview('tax.set', args);
    if (!chk.ok) return chk;
    this.mayor.tax.resident = rd;
    this.mayor.tax.business = bd;
    this.mayorLog(`العمدة (${this.leaderLabel()}) ظبط الضرايب: سكان ${ar(Math.round(rd * 100))}٪، أنشطة ${ar(Math.round(bd * 100))}٪.`);
    return { ok: true, tax: { ...this.mayor.tax } };
  }

  opCollectTaxes() {
    let paid = 0, owed = 0, people = 0;
    for (const r of this.residents) {
      if (r.child) continue;
      const base = this.taxDueOf(r);
      const arrears = this.mayor.taxArrears[r.id] || 0;
      const due = base + arrears;
      if (due <= 0) continue;
      const can = Math.min(r.money, due);
      if (can > 0) {
        r.money -= can;
        r.stats.spent += can;
        this.mayor.treasury += can;
        paid += can;
        people++;
        if (can < due) {
          const rest = due - can;
          this.mayor.taxArrears[r.id] = rest;
          owed += rest;
        } else {
          delete this.mayor.taxArrears[r.id];
        }
      } else {
        this.mayor.taxArrears[r.id] = due;
        owed += due;
      }
    }
    /* ضريبة أنشطة على المحلات اللي ليها صاحب */
    for (const p of this.places) {
      if (!p.ownerId) continue;
      const owner = this.getResident(p.ownerId);
      if (!owner || !(p.salesToday > 0)) continue;
      const due = Math.round(p.salesToday * (this.mayor.tax.business || 0));
      if (due <= 0) continue;
      const can = Math.min(owner.money, due);
      owner.money -= can;
      owner.stats.spent += can;
      this.mayor.treasury += can;
      paid += can;
      if (can < due) this.mayor.taxArrears[owner.id] = (this.mayor.taxArrears[owner.id] || 0) + (due - can);
    }
    this.mayor.lastCollectDay = this.day;
    this.mayor.collectedTotal += paid;
    if (paid > 0) {
      this.mayorLog(`تحصيل ضرايب: ${money(paid)} دخلت خزنة الحارة من ${ar(people)} ساكن${owed > 0 ? ` — فاضل ${money(owed)} متأخر` : ''}.`);
      this.stats.taxes = (this.stats.taxes || 0) + paid;
    } else {
      this.addLog('mayor', 'مفيش ضرايب اتحصّلت النهاردة — مفيش حد معاه فلوس.');
    }
    return { ok: true, paid, owed, people, treasury: this.mayor.treasury };
  }

  opGrant(args) {
    const r = this.getResident(args.residentId);
    if (!r) return { ok: false, reason: 'الساكن مش موجود' };
    const amount = Math.round(Number(args.amount));
    if (!isFinite(amount) || amount <= 0) return { ok: false, reason: 'المبلغ لازم يكون أكبر من صفر' };
    if (amount > this.mayor.treasury) return { ok: false, reason: `الخزنة فيها ${money(this.mayor.treasury)} بس — مفيش فلوس كفاية` };
    if (amount > GRANT_LIMIT_NEEDS_CONFIRM && !args.confirm && !args.ai) {
      return { ok: false, needsConfirm: true, reason: `منحة كبيرة (${money(amount)}) محتاجة تأكيد` };
    }
    this.mayor.treasury -= amount;
    r.money += amount;
    r.stats.earned += amount;
    r.mood = clamp(r.mood + 6, 0, 100);
    this.mayor.grantedTotal += amount;
    this.mayorLog(`منحة ${money(amount)} لـ${r.name} من خزنة الحارة (فاضل ${money(this.mayor.treasury)}).`, r);
    return { ok: true, amount, treasury: this.mayor.treasury };
  }

  moveResidentTo(r, home, rentDueIn = 7) {
    if (!r || !home) return false;
    const wasHome = r.homeId;
    r.homeId = home.id;
    r.homeless = false;
    r.squatting = false;
    if (wasHome !== home.id && !r.child) this.stats.housed++;
    r.flatNo = this.households.filter(h => h.homeId === home.id).length + 1;
    if (!r.child) {
      r.rentAmount = Math.round((home.rent || 260) / (r.spouseId ? 2 : 1.6));
      r.rentDue = this.day + rentDueIn;
      r.rentNotice = 0;
    }
    const car = this.carOf(r);
    if (car) { car.parkedAt = home.id; car.parkAt = this.parkingSpot(home); }
    return true;
  }

  detachFromHome(r) {
    const hh = this.householdOf(r);
    const home = this.homeOf(r);
    if (hh) {
      /* العيلة كلها بتتحرك مع بعض */
      for (const id of hh.members) {
        const m = this.getResident(id);
        if (m) { m.homeId = null; }
      }
      const kids = (hh.kids || []).map(id => this.getResident(id)).filter(Boolean);
      for (const k of kids) k.homeId = null;
      if (home && Array.isArray(home.households)) home.households = home.households.filter(hid => hid !== hh.id);
      hh.homeId = null;
      return { household: hh, members: [...hh.members.map(id => this.getResident(id)).filter(Boolean), ...kids] };
    }
    if (home && Array.isArray(home.households)) {
      /* لو فرد: نتأكد إنه مش مسجل في عيلة */
      r.householdId = null;
    }
    r.homeId = null;
    return { household: null, members: [r] };
  }

  opEvict(args) {
    const r = this.getResident(args.residentId);
    if (!r) return { ok: false, reason: 'الساكن مش موجود' };
    if (r.child) return { ok: false, reason: 'الطفل مايتطردش لوحده — بيخرج مع أهله' };
    if (this.mayor.leadership.holderId === r.id) return { ok: false, reason: 'مينفعش تطرد العمدة نفسه' };
    const home = this.homeOf(r);
    if (!home || home.kind !== 'home') return { ok: false, reason: `${r.name} مش ساكن في بيت` };

    const hh = this.householdOf(r);
    const otherHouseholds = this.households.filter(h => h.homeId === home.id && (!hh || h.id !== hh.id));
    const isLast = otherHouseholds.length === 0;

    let replacement = args.replacementId ? this.getResident(args.replacementId) : null;
    if (replacement) {
      if (replacement.homeId === home.id) return { ok: false, reason: `${replacement.name} ساكن في نفس البيت` };
      if (this.householdOf(replacement)) return { ok: false, reason: 'البديل لازم يكون فرد لوحده مش عيلة' };
    }

    if (isLast && !replacement && !args.allowVacant) {
      const waiting = this.homelessResidents().filter(x => x !== r);
      return {
        ok: false,
        reason: waiting.length
          ? 'ده آخر بيت في العمارة — اختار بديل من اللي بيدوروا على سكن'
          : 'ده آخر بيت في العمارة — مفيش بديل متاح، مينفعش نسيب البيت فاضي',
      };
    }

    const vacants = this.freeFlats().filter(p => p.id !== home.id);
    const moved = this.detachFromHome(r);
    const members = moved.members.filter(Boolean);

    if (vacants.length) {
      const target = pick(vacants);
      const hh2 = moved.household;
      if (hh2) {
        hh2.homeId = target.id;
        target.households = target.households || [];
        if (!target.households.includes(hh2.id)) target.households.push(hh2.id);
        for (const m of members) { this.moveResidentTo(m, target); m.householdId = hh2.id; }
        this.mayorLog(`طرد ${r.name}${hh2.members.length > 1 ? ' وعيلته' : ''} من ${home.name} ونقلهم لـ${target.name}.`, r);
      } else {
        this.moveResidentTo(r, target);
        this.mayorLog(`طرد ${r.name} من ${home.name} ونقله لـ${target.name}.`, r);
      }
    } else {
      for (const m of members) {
        m.homeless = true;
        m.homeId = null;
        m.rentDue = 9999;
        m.mood = clamp(m.mood - 12, 0, 100);
      }
      this.mayorLog(`طرد ${r.name}${members.length > 1 ? ' وعيلته' : ''} من ${home.name} — بقوا بلا مأوى.`, r);
    }

    if (replacement) {
      this.moveResidentTo(replacement, home);
      if (!this.households.some(h => h.homeId === home.id)) {
        home.households = home.households || [];
      }
      this.mayorLog(`${replacement.name} سكن في ${home.name} بعد الطرد.`, replacement);
    }
    this.stats.evictions = (this.stats.evictions || 0) + 1;
    return { ok: true, homeless: !vacants.length, replacementId: replacement ? replacement.id : null };
  }

  opReassign(args) {
    const r = this.getResident(args.residentId);
    if (!r) return { ok: false, reason: 'الساكن مش موجود' };
    const target = this.getPlace(args.homeId);
    if (!target || target.kind !== 'home') return { ok: false, reason: 'اختار بيت موجود' };
    if (r.homeId === target.id) return { ok: false, reason: `${r.name} ساكن في البيت ده بالفعل` };
    if (target.rentalsOpen === false) {
      /* العمدة يقدر يفتح الإيجار قبل النقل */
      return { ok: false, reason: `الإيجار مقفول في ${target.name} — افتحه الأول` };
    }
    const hh = this.householdOf(r);
    const need = hh ? 1 : 1;
    if (this.freeFlatsIn(target) < need) return { ok: false, reason: `${target.name} مليان — مفيش شقة فاضية` };
    if (this.isIllegalOccupant(r)) { /* بنصلّح وضعه */ }

    const oldHome = this.homeOf(r);
    const moved = this.detachFromHome(r);
    const members = moved.members.filter(Boolean);
    if (moved.household) {
      moved.household.homeId = target.id;
      target.households = target.households || [];
      if (!target.households.includes(moved.household.id)) target.households.push(moved.household.id);
      for (const m of members) { this.moveResidentTo(m, target); m.householdId = moved.household.id; }
    } else {
      this.moveResidentTo(r, target);
    }
    this.mayorLog(`نقل ${r.name}${moved.household ? ' وعيلته' : ''} من ${oldHome ? oldHome.name : 'بلا مأوى'} لـ${target.name}.`, r);
    return { ok: true, homeId: target.id };
  }

  opRentals(args) {
    const home = this.getPlace(args.homeId);
    if (!home || home.kind !== 'home') return { ok: false, reason: 'اختار بيت' };
    const open = args.open !== false;
    home.rentalsOpen = open;
    this.mayorLog(open
      ? `فتح إيجار الشقق الفاضية في ${home.name}.`
      : `قفل إيجار الشقق في ${home.name} — مفيش ساكن جديد هيدخل.`);
    return { ok: true, open };
  }

  opFine(args) {
    const r = this.getResident(args.residentId);
    if (!r) return { ok: false, reason: 'الساكن مش موجود' };
    const amount = Math.round(Number(args.amount));
    if (!isFinite(amount) || amount <= 0) return { ok: false, reason: 'الغرامة لازم تكون أكبر من صفر' };
    if (amount > FINE_LIMIT) return { ok: false, reason: `أقصى غرامة ${money(FINE_LIMIT)}` };
    const pay = Math.min(r.money, amount);
    r.money -= pay;
    r.stats.spent += pay;
    this.mayor.treasury += pay;
    const left = amount - pay;
    this.mayor.fines.unshift({ rid: r.id, amount, paid: pay, left, reason: args.reason || 'مخالفة', day: this.day });
    if (this.mayor.fines.length > 60) this.mayor.fines.pop();
    if (left > 0) this.mayor.taxArrears[r.id] = (this.mayor.taxArrears[r.id] || 0) + left;
    r.mood = clamp(r.mood - 6, 0, 100);
    this.stats.fines = (this.stats.fines || 0) + amount;
    this.mayorLog(`غرامة ${money(amount)} على ${r.name}${args.reason ? ' — ' + args.reason : ''}${left > 0 ? ` (دفع ${money(pay)} وفاضل ${money(left)})` : ''}.`, r);
    return { ok: true, paid: pay, left };
  }

  opRemoveTrespasser(args) {
    const r = this.getResident(args.residentId);
    if (!r) return { ok: false, reason: 'الساكن مش موجود' };
    if (!this.isIllegalOccupant(r)) return { ok: false, reason: `${r.name} ساكن بشكل قانوني — مفيش مخالفة` };
    const home = this.homeOf(r);
    const hh = this.householdOf(r);
    if (hh && hh.homeId && hh.homeId !== (home && home.id)) {
      /* بيرجع لبيت عيلته */
      const target = this.getPlace(hh.homeId);
      r.squatting = false;
      r.homeless = false;
      r.homeId = hh.homeId;
      this.mayorLog(`إخراج ${r.name} من ${home ? home.name : 'بيت مش بتاعه'} ورجّعه لبيته ${target ? target.name : ''}.`, r);
      return { ok: true, toHomeId: hh.homeId };
    }
    r.squatting = false;
    r.homeId = null;
    r.homeless = true;
    r.mood = clamp(r.mood - 10, 0, 100);
    this.mayorLog(`إخراج ${r.name} من ${home ? home.name : 'البيت'} — كان ساكن بدون حق.`, r);
    return { ok: true, homeless: true };
  }

  opService(args) {
    const key = args.service;
    if (!SERVICES[key]) return { ok: false, reason: 'الخدمة دي مش موجودة' };
    const on = args.on !== false;
    this.mayor.services[key] = on;
    this.mayorLog(`${on ? 'تشغيل' : 'إيقاف'} خدمة ${SERVICES[key]} في الحارة.`);
    return { ok: true, service: key, on };
  }

  opLeaderAuto(args) {
    const on = args.on === true || args.on === '1';
    this.mayor.leadership.aiMayor = on;
    this.mayorLog(on
      ? 'اتفعّل العمدة الآلي — هيدير الضرايب والإسكان بنفس القواعد.'
      : 'اتوقف العمدة الآلي — القرارات بقت بإيدك.');
    return { ok: true, aiMayor: on };
  }

  opCoverage(args) {
    const level = args.level;
    if (!COVERAGE_LEVELS.includes(level)) return { ok: false, reason: 'مستوى تغطية غير معروف' };
    this.mayor.policeCoverage = level;
    const officers = this.officers().length;
    this.mayorLog(`تغطية الشرطة بقت ${COVERAGE_LABEL[level]} (${ar(officers)} ظابط في القسم).`);
    return { ok: true, level };
  }

  tutorialSnapshot() { return this.tutorial.snapshot(); }
  tutorialStart() { return this.tutorial.start().snapshot(); }
  tutorialNext() { return (this.tutorial.next(), this.tutorial.snapshot()); }
  tutorialSkip() { this.tutorial.skip(); return this.tutorial.snapshot(); }
  tutorialPause(on = true) { this.tutorial.pause(on); return this.tutorial.snapshot(); }
  tutorialRestart() { this.tutorial.restart(); return this.tutorial.snapshot(); }
  tutorialFlag(k, v = true) { this.tutorial.flag(k, v); return this.tutorial.snapshot(); }

  /* ---------- تقرير الحارة للعمدة ---------- */
  mayorReport() {
    const rows = this.residents.filter(r => !r.child).map(r => ({
      id: r.id,
      name: r.name,
      homeId: r.homeId || null,
      home: this.homeOf(r) ? this.homeOf(r).name : 'بلا مأوى',
      job: r.jobTitle || 'بدون شغل',
      income: this.incomeOf(r),
      money: Math.round(r.money),
      taxDue: this.taxDueOf(r) + (this.mayor.taxArrears[r.id] || 0),
      rent: r.rentAmount || 0,
      rentDueDay: r.rentDue,
      violations: this.violationsOf(r),
      homeless: !r.homeId,
    }));
    return {
      treasury: Math.round(this.mayor.treasury),
      tax: { ...this.mayor.tax },
      services: { ...this.mayor.services },
      policeCoverage: this.mayor.policeCoverage,
      leader: this.leaderLabel(),
      aiMayor: !!this.mayor.leadership.aiMayor,
      playerHolds: !!this.mayor.leadership.playerHolds,
      role: this.mayorRole() ? this.mayorRole().name : '—',
      permissions: this.mayorRole() ? this.mayorRole().permissions.slice() : [],
      collectedTotal: Math.round(this.mayor.collectedTotal),
      grantedTotal: Math.round(this.mayor.grantedTotal),
      arrears: Math.round(Object.values(this.mayor.taxArrears).reduce((n, v) => n + v, 0)),
      residents: rows,
      homeless: this.homelessResidents().map(r => ({ id: r.id, name: r.name })),
      homes: this.places.filter(p => p.kind === 'home').map(h => ({
        id: h.id, name: h.name, free: this.freeFlatsIn(h),
        households: this.households.filter(x => x.homeId === h.id).length,
        rentalsOpen: h.rentalsOpen !== false,
        tenants: this.residents.filter(r => r.homeId === h.id && !r.child).length,
      })),
      history: this.mayor.history.slice(0, 12),
      violations: rows.reduce((n, r) => n + r.violations.filter(v => v.code !== 'record').length, 0),
    };
  }

  /* ---------- العمدة الآلي: نفس الأوامر ونفس القيود ---------- */
  aiMayorTick() {
    if (!this.mayor.leadership.aiMayor) return null;
    const done = [];
    const m = this.mayor;

    /* ١) تحصيل الضرايب كل يوم */
    if (this.hasPermission('treasury.collect') && m.tax.resident > 0) {
      const res = this.command('treasury.collect', {}, { ai: true });
      if (res.ok) done.push('collect');
    }
    /* ٢) لو الخزنة فاضية والضرايب واطية → يرفعها شوية (في الحدود) */
    if (this.hasPermission('tax.set') && m.treasury < 200 && m.tax.resident < 0.08) {
      const next = Math.min(TAX_LIMITS.resident[1], Math.round((m.tax.resident + 0.02) * 100) / 100);
      const res = this.command('tax.set', { resident: next, business: m.tax.business }, { ai: true });
      if (res.ok) done.push('tax-up');
    }
    /* ٣) مساعدة الغلابة من الخزنة (بحد أقصى مرتين في اليوم) */
    if (this.hasPermission('treasury.grant') && m.treasury > 400) {
      const needy = this.residents.filter(r => !r.child && r.money < 40).slice(0, 2);
      for (const r of needy) {
        const amount = Math.min(80, Math.floor(m.treasury / 2));
        if (amount <= 0) break;
        const res = this.command('treasury.grant', { residentId: r.id, amount }, { ai: true });
        if (res.ok) done.push('grant:' + r.id);
      }
    }
    /* ٤) إسكان اللي بلا مأوى في الشقق الفاضية */
    if (this.hasPermission('housing.reassign')) {
      const waiting = this.homelessResidents();
      const vacant = this.places.filter(p => p.kind === 'home' && p.rentalsOpen !== false && this.freeFlatsIn(p) > 0);
      for (const r of waiting.slice(0, 2)) {
        const target = vacant.find(h => h.id !== r.homeId);
        if (!target) break;
        const res = this.command('housing.reassign', { residentId: r.id, homeId: target.id }, { ai: true });
        if (res.ok) done.push('house:' + r.id);
      }
    }
    /* ٥) متطفّل في بيت؟ يتشال */
    if (this.hasPermission('resident.removeTrespasser')) {
      const squatter = this.residents.find(r => this.isIllegalOccupant(r));
      if (squatter) {
        const res = this.command('resident.removeTrespasser', { residentId: squatter.id }, { ai: true });
        if (res.ok) done.push('trespass:' + squatter.id);
      }
    }
    return done;
  }

  /* ساكن بقى بلا مأوى: بيدور على سكن، وبينام في الجامع/السبيل، وساعات بيتطفّل */
  homelessDecide(r) {
    const charity = this.places.find(p => p.kind === 'charity');
    const mosque = this.places.find(p => p.style === 'mosque');
    const free = this.places.filter(p => p.kind === 'home' && p.rentalsOpen !== false && this.freeFlatsIn(p) > 0);
    if (free.length && r.money >= (free[0].rent || 260)) {
      const target = pick(free);
      this.moveResidentTo(r, target);
      this.addLog('home', `${r.name} لقي شقة في ${target.name} وسكن تاني.`, r);
      this.think(r, this.line(r, 'movedOut'));
      return true;
    }
    if (r.money > 60 && chance(0.25)) return this.searchJob(r);
    /* تطفّل على شقة فاضية — العمدة ممكن يشيله */
    if (free.length && chance(0.18)) {
      const target = pick(free);
      r.homeId = target.id;
      r.squatting = true;
      this.addLog('event', `${r.name} دخل يسكن في ${target.name} من غير إيجار ولا ورق… الناس بتتكلم.`, r);
      return this.goToPlace(r, target, 'sleep', { duration: rndInt(120, 240), silent: true });
    }
    const night = this.t >= 21 * 60 || this.t < 6 * 60;
    const shelter = charity || mosque;
    if (night && shelter) {
      return this.goToPlace(r, shelter, 'sleep', {
        duration: rndInt(180, 300), silent: true,
        thought: this.line(r, 'idle'),
      });
    }
    return this.wander(r);
  }

  /* ============================================================
     العربيات والمشاوير
     ============================================================ */
  dealership() { return this.getPlace('dealer'); }
  drivers() {
    return this.residents.filter(r => r.carId && !r.child && !this.isLockedUp(r) && (!r.task || r.task.kind !== 'work' || r.jobTitle === 'سواق'));
  }
  carOf(r) { return r && r.carId ? this.cars.find(c => c.id === r.carId) || null : null; }

  parkingSpot(home) {
    if (!home) return { x: 120, y: 200 };
    const n = this.cars.filter(c => c.parkAt && Math.abs(c.parkAt.y - (home.y + home.h)) < 26).length;
    /* بنوقف العربية في الفراغ تحت العمارة — مش على عمارة تانية */
    let y = home.y + home.h + 8;
    const clash = (yy, xx) => this.places.some(q => q !== home && q.kind !== 'land' &&
      xx > q.x - 12 && xx < q.x + q.w + 12 && yy > q.y - 6 && yy < q.y + q.h - 4);
    let x = home.door.x - 40 + (n % 3) * 20;
    for (let k = 0; k < 4 && clash(y, x); k++) x = home.x + 14 + k * 26;
    if (clash(y, x)) y = home.y + home.h - 11;   /* آخر حل: يلزق في القاعدة */
    return { x: Math.round(x), y: Math.round(y) };
  }

  buyCar(owner, modelId, opts = {}) {
    const model = CAR_MODELS.find(m => m.id === modelId) || CAR_MODELS[0];
    if (!owner) return { ok: false, reason: 'مفيش ساكن' };
    if (this.carOf(owner)) return { ok: false, reason: 'معهوش عربية أصلاً؟ لأ، معاه واحدة' };
    if (owner.child) return { ok: false, reason: 'الأطفال مش بيشتروا عربيات' };
    const inst = !!opts.installment;
    const down = inst ? Math.round(model.price * CAR_DOWN_RATE) : model.price;
    if (owner.money < down) {
      return { ok: false, reason: inst ? `المقدم ${money(down)} مش كفاية` : 'الفلوس مش كفاية' };
    }
    owner.money -= down;
    owner.stats.spent += down;
    this.stats.spent += down;
    this.stats.carsSold = (this.stats.carsSold || 0) + 1;
    const rest = model.price - down;
    const home = this.getPlace(owner.homeId);
    const car = {
      id: this.nextCarId++,
      model: model.id, name: model.name, price: model.price,
      color: pick(model.colors),
      ownerId: owner.id,
      plate: `${pick(['أ', 'ب', 'ج', 'د', 'ر', 'س', 'ص'])}${rndInt(1000, 9999)}`,
      boughtDay: this.day,
      parkAt: this.parkingSpot(home),
      parkedAt: home ? home.id : null,
      company: false,
      rides: 0,
    };
    car.installment = inst ? { months: CAR_INSTALL_MONTHS, down } : null;
    this.cars.push(car);
    owner.carId = car.id;
    owner.mood = clamp(owner.mood + 22, 0, 100);
    if (rest > 0) {
      owner.carDebt = {
        carId: car.id, total: rest, left: rest,
        daily: Math.max(1, Math.ceil(rest / (CAR_INSTALL_MONTHS * 30))),
        nextDay: this.day + 1, missed: 0,
      };
      this.addLog('money', `${owner.name} حجز ${model.name} بالتقسيط — دفع مقدم ${money(down)} وفاضل ${money(rest)} على ${ar(CAR_INSTALL_MONTHS)} شهور.`, owner);
      this.think(owner, this.line(owner, 'carInstallment'));
    } else {
      this.addLog('money', `${owner.name} اشترى عربية ${model.name} من المعرض بـ${money(model.price)} — نمرة ${car.plate}.`, owner);
      this.think(owner, this.line(owner, 'newCar'));
    }
    this.toast(`${owner.name.split(' ')[0]} اشترى عربية`);
    return { ok: true, car, installment: rest > 0 };
  }

  /* الخالق بيشتري لأقدر ساكن (أو لأي ساكن مختار) */
  playerBuyCar(modelId, residentId = null, opts = {}) {
    const model = CAR_MODELS.find(m => m.id === modelId) || CAR_MODELS[0];
    const need = opts.installment ? Math.round(model.price * CAR_DOWN_RATE) : model.price;
    let owner = residentId ? this.getResident(residentId) : null;
    if (!owner) {
      const cands = this.residents.filter(r => !r.child && !this.carOf(r) && r.money >= need);
      if (!cands.length) return { ok: false, reason: 'مفيش ساكن معاه فلوس كفاية' };
      cands.sort((a, b) => b.money - a.money);
      owner = cands[0];
    }
    return this.buyCar(owner, modelId, opts);
  }

  assignCompanyCar(driver) {
    if (!driver) return null;
    let car = this.cars.find(c => c.company && !c.driverId);
    if (!car) {
      const model = CAR_MODELS[1];
      car = {
        id: this.nextCarId++, model: model.id, name: model.name, price: model.price,
        color: pick(model.colors), ownerId: null, plate: `ط${rndInt(1000, 9999)}`,
        boughtDay: this.day, parkAt: null, parkedAt: 'dealer', company: true, rides: 0, driverId: null,
      };
      this.cars.push(car);
    }
    car.driverId = driver.id;
    driver.carId = car.id;
    return car;
  }

  requestRide(rider, destId) {
    if (!rider || this.rideOf(rider)) return null;
    if (!this.drivers().length) return null;
    const dest = this.getPlace(destId) || this.getPlace(rider.homeId);
    if (!dest) return null;
    const fare = rndInt(16, 24) + Math.round(Math.hypot(dest.door.x - rider.x, dest.door.y - rider.y) / 12);
    const ride = {
      id: this.nextRideId++,
      riderId: rider.id, driverId: null, destId: dest.id,
      from: { x: rider.x, y: rider.y },
      fare, state: 'waiting', at: this.minute, startedAt: 0,
    };
    this.rides.push(ride);
    rider.task = { kind: 'hail', placeId: dest.id, rideId: ride.id, duration: 25, silent: true };
    rider.phase = 'act';
    rider.until = this.minute + 25;
    rider.path = [];
    this.addLog('ride', `${rider.name} طلب عربية من ${dest.name}… مستني على الرصيف.`, rider);
    return ride;
  }

  rideOf(r) {
    if (!r) return null;
    return this.rides.find(x => x.riderId === r.id && x.state !== 'done') ||
      this.rides.find(x => x.driverId === r.id && x.state !== 'done') || null;
  }

  updateRides() {
    /* 1) ركاب مستنيين وعربيات فاضية */
    for (const ride of this.rides) {
      if (ride.state !== 'waiting') continue;
      const rider = this.getResident(ride.riderId);
      if (!rider) { ride.state = 'done'; continue; }
      if (this.minute - ride.at > 26) {
        ride.state = 'done';
        this.addLog('ride', `${rider.name} زهق من الانتظار ومشي على رجليه.`, rider);
        rider.task = null; rider.phase = 'idle'; rider.until = null;
        continue;
      }
      const freeDrivers = this.drivers().filter(d => !this.rideOf(d) && !this.isLockedUp(d));
      if (!freeDrivers.length) continue;
      const driver = freeDrivers[0];
      ride.driverId = driver.id;
      ride.state = 'pickup';
      ride.startedAt = this.minute;
      driver.onDuty = true;
      driver.task = { kind: 'ride', placeId: driver.workplaceId || 'dealer', rideId: ride.id, stage: 'pickup', duration: 999 };
      driver.phase = 'walk';
      driver.until = null;
      driver.path = this.pathTo(driver, { x: rider.x + rnd(-8, 8), y: rider.y + 8 });
      this.addLog('ride', `🚕 ${driver.name} خد الطلب ورايح لـ${rider.name}.`, driver);
    }

    /* 2) السواق وصل الراكب → الراكب يركب ونطلع للعنوان */
    for (const ride of this.rides) {
      if (ride.state !== 'pickup') continue;
      const driver = this.getResident(ride.driverId);
      const rider = this.getResident(ride.riderId);
      if (!driver || !rider) { ride.state = 'done'; continue; }
      if (Math.hypot(driver.x - rider.x, driver.y - rider.y) < 26) {
        ride.state = 'riding';
        driver.task.stage = 'drop';
        const dest = this.getPlace(ride.destId);
        driver.path = this.pathTo(driver, { x: dest.door.x + rnd(-10, 10), y: dest.door.y + rnd(6, 16) });
        rider.task = { kind: 'ride', placeId: ride.destId, stage: 'riding', rideId: ride.id, duration: 999 };
        rider.phase = 'act';
        rider.until = null;
        this.addLog('ride', `${rider.name} ركب مع ${driver.name} ورايحين ${dest.name}.`, rider);
      }
      if (this.minute - ride.at > 90) {
        ride.state = 'done';
        if (driver.task && driver.task.kind === 'ride') { driver.task = null; driver.phase = 'idle'; }
        if (rider.task && rider.task.kind === 'hail') { rider.task = null; rider.phase = 'idle'; }
      }
    }

    /* 3) الراكب بيقعد جوه العربية (بيتحرك مع السواق) */
    for (const ride of this.rides) {
      if (ride.state !== 'riding') continue;
      const driver = this.getResident(ride.driverId);
      const rider = this.getResident(ride.riderId);
      if (!driver || !rider) { ride.state = 'done'; continue; }
      rider.x = driver.x - 4;
      rider.y = driver.y + 3;
      const dest = this.getPlace(ride.destId);
      if (Math.hypot(driver.x - dest.door.x, driver.y - dest.door.y) < 26) {
        ride.state = 'done';
        rider.x = dest.door.x + rnd(-10, 10);
        rider.y = dest.door.y + rnd(8, 16);
        rider.task = null;
        rider.phase = 'idle';
        rider.until = null;
        driver.task = null;
        driver.phase = 'idle';
        driver.until = null;
        const fare = Math.max(12, Math.round(ride.fare));
        rider.money -= fare;
        rider.stats.spent += fare;
        this.stats.spent += fare;
        const cut = Math.max(3, Math.round(fare * 0.18));
        const earn = fare - cut;
        driver.money += earn;
        driver.stats.earned += earn;
        driver.shiftFare = (driver.shiftFare || 0) + earn;
        this.stats.earned += earn;
        this.stats.fares = (this.stats.fares || 0) + earn;
        this.stats.rides = (this.stats.rides || 0) + 1;
        driver.mood = clamp(driver.mood + 3, 0, 100);
        this.addLog('ride', `${rider.name} نزل في ${dest.name} ودفع ${money(fare)} لـ${driver.name}.`, rider);
        this.fx('sale', dest.door.x, dest.door.y + 12, `+${money(earn)}`);
      }
    }

    this.rides = this.rides.filter(r => r.state !== 'done' || this.minute - (r.at || 0) < 30);
  }

  setMod({ foodPrice = 1, energyDrain = 1, moodBias = 0, name = '', hours = 6 }) {
    this.mod = {
      foodPrice, energyDrain, moodBias, name,
      until: this.minute + hours * 60,
    };
  }
}
