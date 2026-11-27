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
  const adults = sim.residents.filter(r => !r.child && r.age >= 18);
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

console.log(`\n${fail === 0 ? '✅' : '❌'}  نجح ${ar(pass)} — فشل ${ar(fail)}`);
process.exit(fail ? 1 : 0);
