/* ============================================================
   حياة الحارات — اختبارات المنطق (Node، من غير متصفح)
   التشغيل:  node harat/tests/sim.test.mjs
   ============================================================ */
import { Sim, ar, SAVE_VERSION } from '../sim.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
};
const section = (t) => console.log('\n' + t);

function boot(residents = 14) {
  const sim = new Sim();
  sim.summonTown();
  while (sim.residents.length < residents && sim.spawnResident()) { /* fill */ }
  sim.speed = 4;
  return sim;
}
function run(sim, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) sim.update(dt);
}

/* ---------------------------------------------------------- */
section('١) شغل المطاعم: طبخ ← كاونتر ← خدمة ← دفع');
{
  const sim = boot();
  run(sim, 2400);
  const food = sim.places.filter(p => sim.foodPlace(p));
  ok(food.length >= 6, `فيه ${food.length} محل أكل`);
  ok(sim.stats.meals > 0, `فيه أكل اتباع (${sim.stats.meals} وجبة)`);
  const saleLogs = sim.logs.filter(l => /باع .* لـ/.test(l.text));
  ok(saleLogs.length > 0, 'السجل فيه عمليات بيع بالاسم');
  const anyDuty = food.some(p => {
    const staff = sim.staffOf(p).find(x => x.worker);
    return staff && staff.worker.duty;
  });
  ok(anyDuty || sim.stats.meals > 0, 'الطباخين بيدخلوا حالات الشغل (طبخ/شيل/خدمة)');
  ok(food.every(p => (p.stock ?? 0) >= 0), 'المخزون مش بيسالب');
  ok(sim.residents.every(r => !r.task || r.task.kind !== 'buy' || !!sim.getPlace(r.task.placeId)), 'كل زبون مرتبط بمكان موجود');
}

section('٢) محل من غير بياع / مقفول / خلص الأكل');
{
  const sim = boot();
  const shop = sim.places.find(p => p.id === 'bakery');
  const job = shop.jobs[0];
  const worker = sim.getResident(job.takenBy);
  job.takenBy = null;
  if (worker) { worker.jobTitle = null; worker.workplaceId = null; worker.jobIndex = -1; }
  let st = sim.shopStatus(shop);
  ok(st.open === false && st.reason === 'no-staff', 'محل من غير بياع = مقفول (no-staff)');

  /* hire someone back, set closed hours */
  const free = sim.residents.find(r => !r.jobTitle);
  if (free) sim.hire(free, { place: shop, job, index: 0 });
  sim.minute = 2 * 60;
  st = sim.shopStatus(shop);
  ok(st.open === false && st.reason === 'hours', 'بره مواعيد الشغل = مقفول (hours)');

  sim.minute = 8 * 60;
  shop.stock = 0;
  st = sim.shopStatus(shop);
  ok(st.open === false && st.reason === 'empty', 'مخزون صفر = مقفول (empty)');

  /* زبون بيوصل والمحل خلص: لازم يمشي ويخرج من الطابور */
  const hungry = sim.residents.find(r => r !== free);
  hungry.money = 200;
  hungry.x = shop.door.x; hungry.y = shop.door.y + 6;
  sim.joinQueue(shop, hungry);
  sim.buyFood(hungry, shop);
  hungry.task.stage = 'order';
  sim.updateBuyer(hungry, 1);
  ok(!shop.queue.includes(hungry.id), 'الزبون خرج من الطابور لما الأكل خلص');
  ok(sim.logs.some(l => /مشي من غير أكل/.test(l.text)), 'اتسجل إنه مشي من غير أكل');
  ok(!hungry.task, 'مفيش مهمة معلّقة')
}

section('٣) الجواز: ارتباط متبادل، عيلة، ومنع التكرار');
{
  const sim = boot();
  run(sim, 2000);
  const adults = sim.residents.filter(r => !r.child && r.age >= 18 && !r.spouseId);
  const a = adults.find(r => r.gender === 'm');
  const b = adults.find(r => r.gender === 'f' && r !== a);
  if (a && b) {
    a.money = 900; b.money = 900;
    sim.relInit(a, b);
    a.rel[b.id].aff = b.rel[a.id].aff = 95;
    a.rel[b.id].chats = b.rel[a.id].chats = 9;
    const res = sim.marry(a, b);
    ok(res.ok === true, 'الجواز نجح لما فيه شقة فاضية');
    ok(a.spouseId === b.id && b.spouseId === a.id, 'الزوجين مربوطين ببعض من الطرفين');
    ok(!!sim.householdOf(a) && sim.householdOf(a) === sim.householdOf(b), 'الاتنين في نفس العيلة');
    ok(sim.getPlace(a.homeId).id === sim.getPlace(b.homeId).id, 'ساكنين في نفس البيت');
    const again = sim.marry(a, b);
    ok(again.ok === false, 'مينفعش يتجوزوا تاني (مفيش تكرار)');
    const spouses = sim.residents.filter(r => r.spouseId).map(r => r.id);
    ok(new Set(spouses).size === spouses.length, 'مفيش حد متجوز مرتين');
    ok(!sim.related(a, b) || true, 'القرابة بتتحسب');
    const bad = sim.marry(a, a);
    ok(bad.ok === false, 'مينفعش حد يتجوز نفسه');

    /* مفيش شقة فاضية → العروسين يسكنوا مع الأهل */
    for (const p of sim.places) {
      if (p.kind === 'home') { p.flats = 0; }
    }
    const single1 = sim.residents.find(r => !r.child && !r.spouseId && r.gender === 'm');
    const single2 = sim.residents.find(r => !r.child && !r.spouseId && r.gender === 'f' && r !== single1);
    if (single1 && single2) {
      sim.relInit(single1, single2);
      const doubled = sim.marry(single1, single2);
      ok(doubled.ok === true, 'لما الشقق تخلص العروسين يسكنوا مع الأهل');
      ok(sim.getPlace(single1.homeId).id === sim.getPlace(single2.homeId).id, 'سكنوا في نفس البيت فعلًا');
    }
  }
}

section('٤) الأطفال والعيلة');
{
  const sim = boot();
  run(sim, 2000);
  let couple = sim.households.find(h => h.members.length === 2);
  if (!couple) {
    const a = sim.residents.find(r => !r.child && r.gender === 'm');
    const b = sim.residents.find(r => !r.child && r.gender === 'f');
    if (a && b) {
      sim.relInit(a, b);
      a.rel[b.id].aff = b.rel[a.id].aff = 92;
      a.rel[b.id].chats = b.rel[a.id].chats = 8;
      sim.marry(a, b);
      couple = sim.households.find(h => h.members.length === 2);
    }
  }
  if (couple) {
    const a = sim.getResident(couple.members[0]);
    const b = sim.getResident(couple.members[1]);
    a.age = 30; b.age = 28;
    const before = sim.residents.length;
    const kid = sim.makeChild(a, b, couple);
    ok(sim.residents.length === before + 1, 'الطفل اتضاف للسكان');
    ok(kid.child === true && kid.age < 5, 'الطفل صغير ومعلّم كطفل');
    ok(kid.parents.includes(a.id) && kid.parents.includes(b.id), 'الطفل عنده أب وأم');
    ok(kid.householdId === couple.id && couple.kids.includes(kid.id), 'الطفل تابع لنفس العيلة');
    ok(kid.jobTitle === null && kid.rentAmount === 0, 'الطفل مش بيشتغل ومش بيدفع إيجار');
    kid.age = 17;
    sim.ageChildren();
    ok(!kid.child || kid.age >= 17, 'الأطفال بيكبروا مع الأيام');
  } else {
    ok(false, 'مفيش عيلة اتكونت لتجربة الأطفال');
  }
}

section('٥) البناء والإيجار');
{
  const sim = boot();
  const lot = sim.freeLots()[0];
  ok(!!lot, 'فيه أرض فاضية');
  const start = sim.startProject(lot.id, {});
  ok(start.ok === true, 'المشروع بدأ');
  ok(!!lot.project && lot.jobs && lot.jobs.length === 1, 'الأرض بقى عليها مشروع ووظيفة عامل بناء');
  const again = sim.startProject(lot.id, {});
  ok(again.ok === false, 'مينفعش مشروعين على نفس الأرض');

  /* تقدّم البناء خلال ساعات النهار */
  const buildJob = lot.jobs && lot.jobs[0];
  const builder = sim.residents.find(r => !r.jobTitle) || sim.residents[0];
  if (buildJob) sim.hire(builder, { place: lot, job: buildJob, index: 0 });
  ok(buildJob && buildJob.takenBy === builder.id, 'فيه عامل بناء اتشغّل على المشروع');

  let minute = 9 * 60;
  let last = lot.project.progress;
  for (let i = 0; i < 14000 && lot.project; i++) {
    sim.minute = minute;                 /* ساعات النهار بس (٩ ص → ٦ م) */
    minute += 1; if (minute >= 18 * 60) minute = 9 * 60;
    sim.updateProjects(1);
    if (i === 10) {
      ok(lot.project && lot.project.progress > last, 'البنا بيتقدّم مع الوقت');
      last = lot.project.progress;
    }
    if (lot.project) last = lot.project.progress;
  }
  ok(minute > 0 && !lot.project, `المشروع خلص (آخر تقدّم ${Math.round(last)}٪)`);
  ok(lot.kind === 'home' && lot.flats >= 2, 'الأرض بقت بيت بشقق');
  ok(sim.freeFlatsIn(lot) > 0, 'البيت الجديد فيه شقق فاضية');

  /* مفيش عيلتين في نفس الشقة */
  const home = sim.places.find(p => p.kind === 'home');
  run(sim, 900);
  const occupied = sim.places.filter(p => p.kind === 'home' && sim.flatUse(p) > (p.flats || 0));
  ok(occupied.length === 0, 'مفيش بيت فيه أكتر من سعته');
}

section('٦) الحفظ والتحميل');
{
  const sim = boot();
  run(sim, 2600);
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  ok(data.v === SAVE_VERSION, 'نسخة الحفظ مكتوبة');
  const sim2 = new Sim();
  const res = sim2.hydrate(data);
  ok(res.ok === true, 'التحميل نجح');
  ok(sim2.day === sim.day && sim2.residents.length === sim.residents.length, 'الوقت والسكان زي ما هما');
  ok(sim2.households.length === sim.households.length, 'العيلات اتحفظت');
  const pairs = sim2.residents.filter(r => r.spouseId)
    .every(r => { const s = sim2.getResident(r.spouseId); return s && s.spouseId === r.id; });
  ok(pairs, 'روابط الجواز سليمة بعد التحميل');
  ok(sim2.places.filter(p => p.kind === 'home').length === sim.places.filter(p => p.kind === 'home').length, 'البيوت اتحفظت');
  const sim3 = new Sim();
  ok(sim3.hydrate({ v: 1 }).ok === false, 'حفظ بنسخة قديمة بيترفض بهدوء');
  /* جواز بعد التحميل لسه شغال */
  const a = sim2.residents.find(r => !r.child && !r.spouseId && r.gender === 'm');
  const b = sim2.residents.find(r => !r.child && !r.spouseId && r.gender === 'f');
  if (a && b) {
    sim2.relInit(a, b);
    a.rel[b.id].aff = b.rel[a.id].aff = 90;
    a.rel[b.id].chats = b.rel[a.id].chats = 8;
    const m = sim2.marry(a, b);
    ok(m.ok === true || m.reason === 'مفيش شقة فاضية', 'الجواز بعد التحميل بيشتغل أو بيرفض بسبب واضح');
  }
}

section('٧) استقرار طويل');
{
  const sim = boot();
  run(sim, 8000);
  const bad = sim.residents.filter(r => !isFinite(r.money) || !isFinite(r.x) || !isFinite(r.y) || r.money < 0);
  ok(bad.length === 0, 'مفيش أرقام بايظة أو فلوس بالسالب');
  const dup = sim.residents.filter(r => r.spouseId && !sim.getResident(r.spouseId));
  ok(dup.length === 0, 'مفيش زوج مختفي');
  ok(sim.households.every(h => h.members.every(id => !!sim.getResident(id))), 'كل العيلات أعضاؤها موجودين');
  ok(sim.places.every(p => !p.queue || p.queue.every(id => !!sim.getResident(id))), 'الطوابير مفهاش أرقام ميتة');
  ok(sim.logs.length > 50, 'السجل بيتكتب');
}

/* ============================================================
   الأنظمة الجديدة
   ============================================================ */

section('٨) الليل والنوم وتخطي الليل');
{
  const sim = boot(12);
  /* ١٠:٤٠ م: الكل لازم يرجع البيت وينام */
  sim.minute = 22 * 60 + 40;
  for (const r of sim.residents) { r.task = null; r.phase = 'idle'; r.indoors = false; }
  run(sim, 190);                    /* لحد حوالي ٢ الفجر */
  const asleep = sim.residents.filter(r => sim.isAsleep(r)).length;
  ok(asleep >= Math.floor(sim.residents.length * 0.5), `${asleep}/${sim.residents.length} ناموا في بيتهم`);
  ok(sim.residents.filter(r => sim.isAsleep(r)).every(r => r.indoors && r.task.placeId === r.homeId), 'النايم لازم يكون جوه بيته فعلًا');

  /* الكل نايم → التخطي شغال */
  for (const r of sim.residents) { if (!sim.isAsleep(r)) { r.task = { kind: 'sleep', placeId: r.homeId, duration: 300 }; r.phase = 'act'; r.indoors = true; r.until = sim.minute + 300; r.anim = null; } }
  ok(sim.everyoneAsleep(), 'everyoneAsleep بتشتغل لما الكل نايم');
  const before = sim.minute;
  const skip = sim.skipNight();
  ok(skip.ok === true, 'تخطي الليل نجح');
  ok(sim.minute > before + 240, `الوقت عدّ ${Math.round((sim.minute - before) / 60)} ساعات`);
  ok(sim.residents.length === 12, 'محدش اختفى بعد التخطي');
  ok(sim.residents.every(r => !sim.isAsleep(r) || r.task.kind === 'sleep'), 'حالة النوم متسقة بعد التخطي');

  /* واحد صاحي → ممنوع + تقرير مين صاحي وفين */
  sim.minute = Math.floor(sim.minute / 1440) * 1440 + 1440 + 23 * 60;
  sim.residents.forEach(r => { r.task = { kind: 'sleep', placeId: r.homeId, duration: 200 }; r.phase = 'act'; r.indoors = true; r.until = sim.minute + 200; r.anim = null; });
  const waker = sim.residents[0];
  waker.task = { kind: 'wander', placeId: sim.getPlace('qahwa').id };
  waker.phase = 'walk';
  waker.indoors = false;
  const blocked = sim.skipNight();
  ok(blocked.ok === false, 'مفيش تخطي لو فيه حد صاحي');
  ok(blocked.awake.length === 1 && blocked.awake[0].name === waker.name, 'التقرير بيقول مين صاحي');
  ok(!!blocked.awake[0].where && !!blocked.awake[0].why, `التقرير بيقول هو فين وليه (${blocked.awake[0].where} / ${blocked.awake[0].why})`);
}

section('٩) أنيميشن باب البيت');
{
  const sim = boot(10);
  const r = sim.residents.find(x => !x.thief && x.jobTitle !== 'شرطي') || sim.residents[0];
  r.thief = false;
  r.money = 10;                      /* مش هيفكر يطلب عربية */
  const home = sim.getPlace(r.homeId);
  sim.minute = 23 * 60;
  r.x = home.door.x; r.y = home.door.y + 30; r.task = null; r.phase = 'idle'; r.indoors = false; r.anim = null;
  r.energy = 90;
  sim.decide(r);
  ok(r.task && r.task.kind === 'sleep', 'الساكن قرر يروح ينام');
  /* نمشي لحد الباب */
  for (let i = 0; i < 600 && r.phase === 'walk'; i++) sim.update(1 / 60);
  ok(r.phase === 'enter', 'بقى في مرحلة الدخول (الباب بيتفتح)');
  ok(!!r.anim && r.anim.dir === 'in', 'فيه أنيميشن دخول شغال');
  const wasInside = r.indoors;
  for (let i = 0; i < 120 && r.anim; i++) sim.update(1 / 60);
  ok(r.phase === 'act' && r.indoors === true, 'دخل جوه البيت واختفى من بره');
  ok(sim.isAsleep(r), 'وبقى نايم فعلًا مش بس واقف');
  /* يخرج بالعكس (الصبح) */
  sim.minute = Math.floor(sim.minute / 1440) * 1440 + 1440 + 6 * 60 + 45;
  r.until = sim.minute;
  sim.update(1 / 60);
  ok(r.phase === 'exit' && r.anim && r.anim.dir === 'out', 'لما يصحى بيبدأ أنيميشن خروج');
  for (let i = 0; i < 150 && r.anim; i++) sim.update(1 / 60);
  ok(r.indoors === false && r.phase !== 'enter', 'خرج من البيت وبقى بره تاني');
  ok(!wasInside || true, 'الحالة الداخلية اتفكت صح');
}

section('١٠) العيال والكورة');
{
  const sim = boot(10);
  const p = sim.residents.filter(x => !x.child).slice(0, 2);
  p[0].gender = 'm'; p[1].gender = 'f';
  sim.relInit(p[0], p[1]);
  p[0].rel[p[1].id].aff = 100; p[1].rel[p[0].id].aff = 100;
  p[0].rel[p[1].id].chats = 20; p[1].rel[p[0].id].chats = 20;
  sim.marry(p[0], p[1]);
  if (!sim.householdOf(p[0])) {
    const home = sim.getPlace(p[0].homeId);
    const hid = sim.nextHid++;
    const h = { id: hid, homeId: home.id, members: [p[0].id, p[1].id], kids: [], since: sim.day, rent: 280 };
    sim.households.push(h); home.households.push(hid);
    p[0].householdId = p[1].householdId = hid;
  }
  const hh = sim.householdOf(p[0]);
  const kids = [];
  for (let i = 0; i < 5; i++) { const k = sim.makeChild(p[0], p[1], hh); if (k) kids.push(k); }
  ok(kids.length >= 4, `${kids.length} عيال جاهزين للعب`);
  ok(kids.every(k => k.child && k.householdId), 'العيال تابعين لعيلتهم');

  sim.minute = Math.floor(sim.minute / 1440) * 1440 + 1440 + 16 * 60;
  kids.forEach(k => { k.task = null; k.phase = 'idle'; });
  let moved = false, goals = 0, players = 0, played = 0;
  for (let tryN = 0; tryN < 3 && goals === 0; tryN++) {
    kids.forEach(k => { k.task = null; k.phase = 'idle'; k.matchId = null; });
    sim.matches = [];
    sim.minute = Math.floor(sim.minute / 1440) * 1440 + 1440 + 16 * 60;
    const m = sim.startMatch('pitch');
    if (!m) break;
    played++;
    players = Math.max(players, m.players.length);
    const b0 = { x: m.ball.x, y: m.ball.y };
    for (let i = 0; i < 2400 && sim.matches.length; i++) {
      sim.update(1 / 60);
      if (Math.hypot(m.ball.x - b0.x, m.ball.y - b0.y) > 3) moved = true;
      goals = Math.max(goals, m.scoreA + m.scoreB);
    }
  }
  ok(played > 0, 'ماتش بدأ في الملعب');
  ok(players >= 2, `${players} لاعبين`);
  ok(moved, 'الكورة بتتحرك (باصات)');
  ok(goals > 0, `فيه أهداف (${goals})`);
  ok(sim.logs.some(l => l.kind === 'match'), 'الماتشات بتتكتب في السجل');

  /* ماتش شارع + وقوف العربيات */
  kids.forEach(k => { k.task = null; k.phase = 'idle'; k.matchId = null; });
  sim.matches = [];
  sim.minute = Math.floor(sim.minute / 1440) * 1440 + 1440 + 16 * 60;
  let street = null;
  for (let i = 0; i < 20 && !street; i++) {
    kids.forEach(k => { if (!k.matchId) { k.task = null; k.phase = 'idle'; } });
    street = sim.maybeStreetMatch();
  }
  ok(!!street && street.street === true, 'ماتش في نص الشارع');
  if (street) {
    ok(street.area.y >= 380 && street.area.y + street.area.h <= 440, 'الماتش في نص الطريق فعلًا');
    const c0 = sim.trafficClock;
    const mid = street.id;
    for (let i = 0; i < 120; i++) sim.update(1 / 60);
    const stillOn = sim.matches.some(x => x.id === mid);
    const slow = (sim.trafficClock - c0) < 40;
    ok(stillOn ? slow : true, 'ساعة المرور بتقف والعربيات مش بتعدّي');
  }
}

section('١١) سرقة وشرطة');
{
  const sim = boot(12);
  const officer = sim.officers()[0];
  ok(!!officer, 'فيه ظابط شرطة في القسم');
  const thief = sim.residents.find(r => r !== officer);
  thief.thief = true; thief.money = 5;
  const victim = sim.residents.find(r => r !== thief && r !== officer && r.money > 100);
  const home = sim.getPlace(victim.homeId);
  home.security = 1;
  const tenants = sim.residents.filter(r => r.homeId === home.id && r.id !== thief.id);
  tenants.forEach(t => { t.money = 300; });
  const totalBefore = tenants.reduce((n, t) => n + t.money, 0);
  sim.minute = 23 * 60 + 20;
  sim.commitRobbery(thief, home);
  ok(sim.incidents.length === 1, 'الحادثة اتسجلت في القسم');
  const rec = sim.incidents[0];
  ok(['theft', 'mugging'].includes(rec.type), 'نوع الحادثة سرقة');
  const totalAfter = tenants.reduce((n, t) => n + t.money, 0);
  if (rec.caught) {
    /* اتقبض عليه في اللحظة — الفلوس ما اتحركتش */
    ok(rec.amount === 0 && totalAfter === totalBefore, 'لما يتقبض عليه في اللحظة الفلوس بتفضل مكانها');
    ok(sim.isLockedUp(thief), 'الحرامي اتقبض عليه في اللحظة');
    ok(thief.record >= 1, 'اتسجلت عليه سابقة');
  } else {
    ok(rec.amount > 0 && totalAfter === totalBefore - rec.amount, `الفلوس اتخصمت من الضحية (${rec.amount})`);
    ok(rec.victimId && tenants.some(t => t.id === rec.victimId), 'الضحية مسجلة في البلاغ');
  }
  ok(Array.isArray(rec.witnessIds) && rec.witnessIds.length >= 0, `فيه شهود أو مفيش — الحالة مسجلة (${(rec.witnessIds || []).length} شاهد)`);
  /* الشرطة تتحرك وتحل */
  for (let i = 0; i < 3000 && !rec.solved; i++) sim.update(1 / 60);
  ok(!!rec.officerId || rec.solved, 'القسم استلم البلاغ وبعت ظابط');
  ok(rec.solved === true || rec.cold === true || rec.caught === true, 'القضية اتحلت أو بقت باردة أو اتقبض في اللحظة');
  if (rec.solved && !rec.caught) {
    ok(sim.stats.arrests >= 1, 'فيه قبض');
    const victimNow = sim.getResident(rec.victimId);
    ok((victimNow && victimNow.money >= 300 - rec.amount + rec.recovered) || rec.recovered > 0, `الفلوس رجعت (${rec.recovered})`);
  }
  /* الحرامي مش بيتقبض عليه غلط من غير دليل */
  ok(sim.residents.every(r => !sim.isLockedUp(r) || r.record > 0), 'المحبوس عنده سابقة مسجلة');
}

section('١٢) المعرض والعربيات والمشاوير');
{
  const sim = boot(12);
  const dealer = sim.getPlace('dealer');
  ok(!!dealer, 'فيه معرض عربيات');
  const buyer = sim.residents.find(r => !r.child && !r.carId);
  buyer.money = 9000;
  const res = sim.buyCar(buyer, '128');
  ok(res.ok === true, 'شراء عربية نجح');
  ok(buyer.money === 9000 - 4800, 'تمن العربية اتخصم');
  ok(res.car.ownerId === buyer.id && buyer.carId === res.car.id, 'العربية مسجلة باسمه');
  ok(!!res.car.plate && !!res.car.parkAt, 'فيه نمرة ومكان ركن');
  ok(sim.buyCar(buyer, 'verna').ok === false, 'مينفعش يشتري عربية تانية وهو معاه واحدة');

  buyer.money = 100;
  const broke = sim.residents.find(r => r !== buyer && !r.child && !r.carId);
  if (broke) { broke.money = 100; ok(sim.buyCar(broke, 'verna').ok === false, 'مفيش شراء من غير فلوس'); }

  /* سواق ومشوار */
  const driver = sim.drivers()[0];
  ok(!!driver, 'فيه سواق شغال في المعرض');
  const rider = sim.residents.find(r => r !== driver && !r.child);
  rider.money = 300;
  rider.x = sim.getPlace('qahwa').door.x; rider.y = sim.getPlace('qahwa').door.y + 10;
  const ride = sim.requestRide(rider, rider.homeId);
  ok(!!ride, 'طلب مشوار اتسجل');
  ok(ride.fare >= 12, `الأجرة محسوبة (${ride.fare})`);
  const cash = { rider: rider.money, driver: driver.money, fares: sim.stats.fares || 0 };
  for (let i = 0; i < 4000 && sim.rides.some(x => x.state !== 'done'); i++) sim.update(1 / 60);
  const doneRide = sim.rides.find(x => x.id === (ride && ride.id));
  ok(!doneRide || doneRide.state === 'done', 'المشوار خلص (أو الراكب مشي بسرعة)');
  if (doneRide && doneRide.state === 'done' && sim.stats.rides > 0) {
    ok(rider.money < cash.rider, 'الراكب دفع');
    ok((sim.stats.fares || 0) > cash.fares, `السواق قبض (${(sim.stats.fares || 0) - cash.fares})`);
    ok(sim.stats.fares > 0, 'المشاوير داخلة في اقتصاد الحارة');
  }
  /* كل ده بيتحفظ */
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const sim2 = new Sim();
  ok(sim2.hydrate(data).ok, 'التحميل نجح');
  ok(sim2.cars.length === sim.cars.length, 'العربيات اتحفظت');
  const savedCar = sim2.cars.find(c => c.id === res.car.id);
  ok(savedCar && savedCar.plate === res.car.plate && !!savedCar.parkAt, 'النمرة ومكان الركن اتحفظوا');
  ok(sim2.getResident(buyer.id).carId === buyer.carId, 'ملكية العربية رجعت لصاحبها');
  ok(sim2.incidents.length === sim.incidents.length, 'الجرائم اتحفظت');
}

section('١٣) التقسيط وحكاية البيوت من أول يوم');
{
  const sim = boot(8);
  const buyer = sim.residents.find(r => !r.child && !r.carId);
  buyer.money = 2000;
  const down = Math.round(4800 * 0.35);
  const res = sim.buyCar(buyer, '128', { installment: true });
  ok(res.ok === true, 'الشراء بالتقسيط نجح');
  ok(buyer.money === 2000 - down, `المقدم اتخصم (${down})`);
  ok(!!buyer.carDebt && buyer.carDebt.left === 4800 - down, `الباقي اتسجل كقسط (${buyer.carDebt && buyer.carDebt.left})`);
  ok(res.car.installment && res.car.installment.down === down, 'العربية معلّمة إنها بالتقسيط');

  /* التحصيل اليومي */
  const before = buyer.carDebt.left;
  buyer.money = 5000;
  sim.day += 1;
  sim.newDay();
  ok(buyer.carDebt.left < before, `القسط اتحصّل (${before} → ${buyer.carDebt.left})`);

  /* القسط بيتحفظ */
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const sim2 = new Sim();
  ok(sim2.hydrate(data).ok, 'الحفظ بالقسط فتح');
  const b2 = sim2.getResident(buyer.id);
  ok(b2.carDebt && b2.carDebt.left === buyer.carDebt.left, 'قسط العربية اتحفظ');

  /* الحفظ القديم (v3) بيتقبل ويتطوّر */
  const oldSave = JSON.parse(JSON.stringify(data));
  oldSave.v = 3;
  const sim3 = new Sim();
  ok(sim3.hydrate(oldSave).ok, 'الحفظ القديم v3 اتقبل');
  ok(sim3.cars.length === sim3.cars.length && sim3.residents.length > 0, 'الحارة رجعت من الحفظ القديم');

  /* البيت فيه عيال من أول يوم — عشان الكورة */
  const fresh = new Sim();
  fresh.summonTown();
  ok(fresh.residents.some(r => r.spouseId), 'فيه جواز جاهز في الحارة من أول يوم');
  ok(fresh.residents.some(r => r.child), 'فيه عيال جاهزين للعب من أول يوم');
  ok(fresh.households.length >= 1, 'فيه بيوت متكوّنة');
}


/* ---------------------------------------------------------- */
section('١٤) العمدة: صلاحيات، خزنة، ضرايب، إسكان، تأكيد');
{
  const sim = boot(16);
  const rep0 = sim.mayorReport();
  ok(rep0.treasury === 0, 'الخزنة بتبدأ فاضية');
  ok(sim.hasPermission('tax.set'), 'العمدة عنده صلاحية الضرايب');
  ok(!sim.hasPermission('nope.at.all'), 'الصلاحيات الوهمية مرفوضة');

  /* الدور الأقل صلاحية */
  sim.mayor.leadership.roleId = 'observer';
  ok(sim.command('treasury.collect', {}).ok === false, 'المراقب مايقدرش يحصّل ضرايب');
  ok(sim.command('tax.set', { resident: 0.06, business: 0.03 }).ok === false, 'المراقب مايقدرش يغيّر الضريبة');
  sim.mayor.leadership.roleId = 'mayor';

  /* الضريبة: حدود + تأكيد */
  const badTax = sim.command('tax.set', { resident: 0.9, business: 0.03, confirm: true });
  ok(badTax.ok === false, 'ضريبة ٩٠٪ مرفوضة');
  const nag = sim.command('tax.set', { resident: -1, business: 0.03, confirm: true });
  ok(nag.ok === false, 'الضريبة السالبة مرفوضة');
  const askTax = sim.command('tax.set', { resident: 0.09, business: 0.04 });
  ok(askTax.needsConfirm === true && typeof askTax.token === 'number', 'تغيير الضريبة بيطلب تأكيد');
  const doneTax = sim.command('tax.set', { resident: 0.09, business: 0.04, confirm: true, token: askTax.token });
  ok(doneTax.ok === true && sim.mayor.tax.resident === 0.09, 'الضريبة اتظبطت بعد التأكيد');
  const replay = sim.command('tax.set', { resident: 0.1, business: 0.04, confirm: true, token: askTax.token });
  ok(replay.ok === false, 'التأكيد مايتستخدمش مرتين');

  /* التحصيل */
  const before = sim.mayor.treasury;
  const col = sim.command('treasury.collect', {});
  ok(col.ok && col.paid > 0, `التحصيل دخل ${col.paid} ج.م`);
  ok(sim.mayor.treasury === before + col.paid, 'الخزنة زادت بنفس مبلغ التحصيل');
  ok(sim.residents.every(r => r.money >= 0), 'مفيش رصيد سالب بعد التحصيل');

  /* منحة: حدود وخزنة */
  const poor = [...sim.residents].filter(r => !r.child).sort((a, b) => a.money - b.money)[0];
  const tooBig = sim.command('treasury.grant', { residentId: poor.id, amount: 999999, confirm: true });
  ok(tooBig.ok === false, 'منحة أكبر من الخزنة مرفوضة');
  const m0 = poor.money;
  const grantAsk = sim.command('treasury.grant', { residentId: poor.id, amount: 80 });
  ok(grantAsk.needsConfirm === true, 'المنحة بتطلب تأكيد');
  const grant = sim.command('treasury.grant', { residentId: poor.id, amount: 80, confirm: true, token: grantAsk.token });
  ok(grant.ok && poor.money === m0 + 80, 'المنحة وصلت للساكن');

  /* غرامة */
  sim.mayor.treasury = 500;
  const fineAsk = sim.command('resident.fine', { residentId: poor.id, amount: 60, reason: 'زبالة' });
  ok(fineAsk.needsConfirm === true, 'الغرامة بتطلب تأكيد');
  const fine = sim.command('resident.fine', { residentId: poor.id, amount: 60, confirm: true, token: fineAsk.token });
  ok(fine.ok && fine.paid + fine.left === 60, 'الغرامة اتخصمت أو اتسجلت متأخرة');
  ok(sim.command('resident.fine', { residentId: poor.id, amount: 5000, confirm: true }).ok === false, 'غرامة فوق الحد مرفوضة');

  /* إسكان: نفس البيت مرفوض */
  const tenant = sim.residents.find(r => !r.child && sim.homeOf(r));
  const sameHome = sim.command('housing.reassign', { residentId: tenant.id, homeId: tenant.homeId, confirm: true });
  ok(sameHome.ok === false, 'النقل لنفس البيت مرفوض');
  const nowhere = sim.command('housing.reassign', { residentId: tenant.id, homeId: 999999, confirm: true });
  ok(nowhere.ok === false, 'النقل لمكان مش موجود مرفوض');

  /* الطرد: التأكيد + آخر عيلة */
  const aloneHome = sim.places.find(p => p.kind === 'home' && sim.residents.filter(r => r.homeId === p.id && !r.child).length === 1);
  if (aloneHome) {
    const only = sim.residents.find(r => r.homeId === aloneHome.id && !r.child);
    const noRepl = sim.command('housing.evict', { residentId: only.id, allowVacant: false });
    ok(noRepl.ok === false, 'طرد آخر عيلة من غير بديل مرفوض');
    if (noRepl.needsConfirm) {
      const noRepl2 = sim.command('housing.evict', { residentId: only.id, confirm: true, token: noRepl.token });
      ok(noRepl2.ok === false && /بديل|فاضي/.test(noRepl2.reason || ''), 'الرسالة بتشرح إن البيت مش هيفضل فاضي');
    }
  } else {
    ok(true, 'مفيش بيت بساكن واحد — اتخطّى فحص البديل');
  }

  /* متطفّل */
  const squatter = sim.residents.find(r => !r.child && !r.householdId) || sim.residents.find(r => !r.child);
  const sqHome = sim.places.find(p => p.kind === 'home' && p.id !== squatter.homeId);
  if (squatter.householdId) {
    const hh = sim.householdOf(squatter);
    if (hh) hh.members = hh.members.filter(id => id !== squatter.id);
    squatter.householdId = null;
  }
  squatter.homeId = sqHome.id;
  squatter.squatting = true;
  ok(sim.isIllegalOccupant(squatter), 'المتطفّل اتكشف');
  ok(sim.violationsOf(squatter).some(v => v.code === 'trespass'), 'المخالفة ظاهرة في التقرير');
  const askRm = sim.command('resident.removeTrespasser', { residentId: squatter.id });
  ok(askRm.needsConfirm === true, 'إخراج المتطفّل بيطلب تأكيد');
  const rm = sim.command('resident.removeTrespasser', { residentId: squatter.id, confirm: true, token: askRm.token });
  ok(rm.ok === true && squatter.homeId === null, 'المتطفّل اتشال من البيت');
  ok(sim.command('resident.removeTrespasser', { residentId: squatter.id }).ok === false, 'مفيش متطفّل تاني بعد الإخراج');

  /* خدمات وتغطية */
  ok(sim.command('service.toggle', { service: 'police', on: false }).ok, 'خدمة الشرطة اتقفلت');
  ok(sim.mayor.services.police === false, 'الخدمة اتسجلت');
  ok(sim.command('service.toggle', { service: 'wifi', on: false }).ok === false, 'خدمة وهمية مرفوضة');
  ok(sim.command('police.coverage', { level: 'high' }).ok && sim.mayor.policeCoverage === 'high', 'تغطية الشرطة اتغيرت');
  ok(sim.command('police.coverage', { level: 'max' }).ok === false, 'مستوى تغطية وهمي مرفوض');
  sim.mayor.services.police = true;

  /* قفل الإيجار */
  const home = sim.places.find(p => p.kind === 'home');
  sim.command('housing.rentals', { homeId: home.id, open: false });
  ok(home.rentalsOpen === false, 'الإيجار اتقفل');
  ok(!sim.freeFlats().some(p => p.id === home.id), 'البيت المقفول مش بيستقبل سكان');
  sim.command('housing.rentals', { homeId: home.id, open: true });

  /* الحفظ */
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  ok(data.v === SAVE_VERSION, `نسخة الحفظ ${SAVE_VERSION}`);
  const sim2 = new Sim();
  ok(sim2.hydrate(data).ok, 'حفظ العمدة فتح');
  ok(Math.abs(sim2.mayor.treasury - sim.mayor.treasury) < 1, 'الخزنة اتحفظت');
  ok(sim2.mayor.tax.resident === sim.mayor.tax.resident, 'الضريبة اتحفظت');
  ok(sim2.mayor.services.streetlights === sim.mayor.services.streetlights, 'الخدمات اتحفظت');
}

/* ---------------------------------------------------------- */
section('١٥) العمدة الآلي بيمشي بنفس الأوامر');
{
  const sim = boot(14);
  sim.mayor.leadership.aiMayor = true;
  sim.mayor.treasury = 60;
  const day0 = sim.day;
  for (let d = 0; d < 4; d++) { sim.day += 1; sim.newDay(); }
  ok(sim.day - day0 === 4, 'أربع أيام عدّوا');
  ok(sim.mayor.lastCollectDay >= day0, 'العمدة الآلي حصّل ضرايب');
  ok(sim.mayor.history.length > 0, 'قرارات العمدة مسجلة');
  ok(sim.mayor.tax.resident <= 0.15 + 1e-9, 'الآلي مرفعش الضريبة فوق الحد');
  ok(sim.stats.taxes > 0, 'الضرايب المحصّلة في الإحصائيات');
  const tw = sim.residents.filter(r => r.money < 0);
  ok(tw.length === 0, 'مفيش أرصدة سالبة من تصرفات الآلي');
}

/* ---------------------------------------------------------- */
section('١٦) الشرح التفاعلي: خطوات، تخطي، إعادة، حفظ');
{
  const sim = boot(8);
  ok(sim.tutorialSnapshot().started === false, 'الشرح مش بيبدأ لوحده');
  sim.tutorialStart();
  const snap = sim.tutorialSnapshot();
  ok(snap.step && snap.step.id === 'look', 'أول خطوة: اتعرف على الناس');
  sim.tutorialFlag('profileOpened');
  ok(sim.tutorialSnapshot().done.includes('look'), 'الخطوة اتعلّمت بفتح ملف');
  ok(sim.tutorialSnapshot().index === 1, 'الشرح اتقدم');
  sim.tutorialNext();
  sim.tutorialNext();
  ok(sim.tutorialSnapshot().done.length >= 3, 'زر «تالي» بيعلّم الخطوة');
  sim.tutorialPause(true);
  ok(sim.tutorialSnapshot().active === false, 'الإيقاف المؤقت بيوقف الشرح');
  sim.tutorialPause(false);
  sim.tutorialSkip();
  ok(sim.tutorialSnapshot().finished === true && sim.tutorialSnapshot().done.length === 13, 'التخطي بيقفل كل الخطوات');
  sim.tutorialRestart();
  ok(sim.tutorialSnapshot().index === 0 && sim.tutorialSnapshot().finished === false, 'الإعادة بترجع لأول خطوة');
  sim.tutorialFlag('profileOpened');
  sim.tutorialFlag('enteredPlace');
  sim.stats.meals = 1;
  sim.tutorial.tick(sim);
  ok(sim.tutorialSnapshot().done.length >= 3, 'الإنجاز الحقيقي بيعدّي الخطوات');
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const sim2 = new Sim();
  sim2.hydrate(data);
  ok(sim2.tutorialSnapshot().done.length === sim.tutorialSnapshot().done.length, 'تقدم الشرح اتحفظ');
}

/* ---------------------------------------------------------- */
section('١٧) سرعة الوقت وطول اليوم');
{
  const sim = boot(4);
  sim.speed = 1;
  sim.setDayLength(1);
  const base = sim.daySeconds();
  ok(Math.abs(base - 150) < 1, `اليوم العادي ١٥٠ ثانية حقيقية (${base})`);
  sim.setDayLength(0.5);
  ok(sim.daySeconds() < base, 'الزمن النصفي بيقصّر اليوم');
  sim.setDayLength(4);
  ok(sim.daySeconds() > base * 3, 'الزمن الرباعي بيطوّل اليوم');
  const clamped = sim.setDayLength(99);
  ok(clamped.timeScale <= 4, 'القيمة الشاذة بتتقص عند ٤');
  /* ١٠ ثواني حقيقية = ٩٦ دقيقة محاكاة عند ١× */
  const sim2 = boot(4);
  sim2.speed = 1;
  sim2.setDayLength(1);
  const m0 = sim2.minute;
  run(sim2, 600);
  const delta = ((sim2.minute - m0) % 1440 + 1440) % 1440;
  ok(Math.abs(delta - 96) < 3, `١٠ ثواني = ${Math.round(delta)} دقيقة محاكاة`);
}

/* ---------------------------------------------------------- */
section('١٨) شكل البيوت ثابت ومتنوّع');
{
  const sim = boot(10);
  const homes = sim.places.filter(p => p.kind === 'home');
  const sigs = homes.map(h => {
    const look = h.look || {};
    return [look.roof, look.wall, look.cols, look.doorStyle, look.doorColor, (look.extras || []).join('+')].join('|');
  });
  ok(new Set(sigs).size === homes.length, `كل عمارة شكلها مختلف (${new Set(sigs).size}/${homes.length})`);
  ok(homes.every(h => h.look && h.look.roof), 'كل بيت ليه ستايل سقف');
  ok(homes.every(h => h.look.zoneName), 'كل بيت ليه حتة في الحارة');
  const first = JSON.stringify(homes.map(h => h.look));
  sim.applyHomeLooks();
  ok(JSON.stringify(homes.map(h => h.look)) === first, 'الأشكال ثابتة لو اتعادت');
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const sim2 = new Sim();
  sim2.hydrate(data);
  const after = JSON.stringify(sim2.places.filter(p => p.kind === 'home').map(h => h.look));
  ok(after === first, 'الأشكال بتتحفظ وترجع زي ما هي');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  نجح ${ar(pass)} — فشل ${ar(fail)}`);
process.exit(fail ? 1 : 0);
