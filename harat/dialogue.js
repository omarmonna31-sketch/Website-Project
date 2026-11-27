/* ============================================================
   حوار السكان — محرّك بيانات محلي (من غير شبكة ولا DOM)

   كل جملة عندها شرط (when) بيتقارن بحالة الساكن الحقيقية:
   الشغل، المزاج، الوقت، الفلوس، الأكل، الطاقة، العلاقة،
   حالته الاجتماعية (جواز/عيال/عربية/سابقة)، ومسار الأحداث الأخيرة.

   - مفيش تكرار: كل ساكن عنده سجل استخدام لكل جملة (cooldown)،
     وفيه cooldown عام على مستوى الحارة.
   - مفيش تناقض: الجملة مش بتتقال غير لو الحالة بتسمح بيها
     (مفيش «جمعت شوية» لساكن مفلس، ولا «الجو حرّ» في عزّ الشتا… إلخ).
   ============================================================ */

export const LINE_COOLDOWN = 200;        /* دقائق محاكاة: نفس الشخص مش يعيد نفس الجملة */
export const LINE_GLOBAL_COOLDOWN = 55;  /* دقائق محاكاة: نفس الجملة مش تتكرر من أي حد في الحارة */
export const RECENT_MEMORY = 6;          /* آخر كام جملة نفتكرها لكل ساكن */

/* ---------- تصنيف الشغل (بيتستخدم في شروط الجُمل) ---------- */
const JOB_GROUPS = {
  cook: ['طباخ', 'بياع كشري', 'خباز', 'خباز فطير', 'بياع ساندوتشات'],
  shop: ['بقال', 'بياع خضار', 'بياع موبايلات', 'كاشير', 'صبي قهوة', 'صيدلي'],
  office: ['موظف', 'مدرس'],
  craft: ['نجار', 'كهربائي', 'عامل مغسلة', 'عامل بناء'],
  dealer: ['بياع عربيات', 'سواق'],
  police: ['شرطي'],
  sport: ['مدرب كورة'],
};

export function jobGroup(jobTitle) {
  if (!jobTitle) return 'none';
  for (const [g, list] of Object.entries(JOB_GROUPS)) if (list.includes(jobTitle)) return g;
  return 'other';
}

/* ---------- الحالة اللي بتتقاس عليها الجُمل ---------- */
export function contextOf(sim, r, extra = {}) {
  const hour = Math.floor((((sim.minute % 1440) + 1440) % 1440) / 60);
  return {
    hour,
    minute: sim.minute,
    day: sim.day,
    job: jobGroup(r.jobTitle),
    jobTitle: r.jobTitle || '',
    mood: r.mood,
    money: r.money,
    hunger: r.hunger,
    energy: r.energy,
    gender: r.gender,
    child: !!r.child,
    married: !!r.spouseId,
    kids: (r.kids || []).length || sim.residents.filter(x => (x.parents || []).includes(r.id)).length,
    hasCar: !!r.carId,
    carDebt: r.carDebt && r.carDebt.left > 0,
    record: r.record || 0,
    thief: !!r.thief,
    asleepNow: sim.isAsleep ? sim.isAsleep(r) : false,
    powerCut: !!r.powerCut,
    inJail: sim.isLockedUp ? sim.isLockedUp(r) : false,
    aff: extra.partner ? sim.affOf(r, extra.partner) : 0,
    partner: extra.partner || null,
    place: extra.place || null,
    recentCrime: sim.recentEventAge ? sim.recentEventAge('crime') : Infinity,
    recentMatch: sim.recentEventAge ? sim.recentEventAge('match') : Infinity,
    recentWedding: sim.recentEventAge ? sim.recentEventAge('love') : Infinity,
    recentPolice: sim.recentEventAge ? sim.recentEventAge('police') : Infinity,
    taxRate: sim.mayor ? sim.mayor.tax.resident : 0,
    treasury: sim.mayor ? sim.mayor.treasury : 0,
    ...extra.flags,
  };
}

const inRange = (v, range) => Array.isArray(range) && v >= range[0] && v <= range[1];
const hourIn = (h, range) => {
  if (!Array.isArray(range)) return true;
  const [a, b] = range;
  return a <= b ? h >= a && h <= b : h >= a || h <= b;   /* بيلف حوالين نص الليل */
};

/* when: {hour:[a,b], mood:[lo,hi], money:[lo,hi], hunger:[..], energy:[..],
          job:'cook'|'none'|..., gender:'m'|'f', married:true, kids:[1,9],
          hasCar:true, carDebt:true, record:[1,9], thief:true,
          recentCrime:[0,180], recentMatch:[0,180], taxRate:[0.01,1], ...}
   disapproval: الجملة دي بتزعل حد؟ (بتقلل المزاج لو حد قريب سمعها) */
function fits(when, ctx) {
  if (!when) return true;
  for (const [k, want] of Object.entries(when)) {
    const have = ctx[k];
    if (Array.isArray(want)) {
      if (k === 'hour') { if (!hourIn(ctx.hour, want)) return false; continue; }
      if (!inRange(Number(have), want)) return false;
      continue;
    }
    if (typeof want === 'boolean') { if (!!have !== want) return false; continue; }
    if (typeof want === 'string') { if (String(have) !== want) return false; continue; }
    if (typeof want === 'number') { if (Number(have) !== want) return false; continue; }
  }
  return true;
}

/* ============================================================
   الجُمل
   ============================================================ */
export const LINES = {
  /* ---------- الشغل ---------- */
  work: [
    { t: 'الشغل ما بيخلصش، بس القرش بيحلى في الإيد.', when: { mood: [40, 100] } },
    { t: 'الأسطى بيقول الشغل كتير النهاردة… ربنا يعين.', when: { job: 'craft' } },
    { t: 'لو فضلت شغال كده، ممكن أجمع لشقة أحسن.', when: { money: [200, 100000] } },
    { t: 'أنا مش بحب الشغل ده، بس بيجيب عيش.', when: { mood: [0, 45] } },
    { t: 'بعد الشيفت هعدي على القهوة أشرب حاجة.', when: { hour: [14, 21] } },
    { t: 'إيدي بتوجعني، بس اليومية هتوصل.', when: { job: 'craft' } },
    { t: 'الشيفت بدري النهاردة… لسه بفتح المحل.', when: { hour: [6, 10] } },
    { t: 'قدامي زباين كتير، مش عارف ألحق.', when: { job: 'cook' } },
    { t: 'الورق في المصلحة ما بيخلصش… طابور وخلاص.', when: { job: 'office' } },
    { t: 'المعرض فيه عربيات جديدة… نفسي في واحدة.', when: { job: 'dealer' } },
    { t: 'الدورية النهاردة طويلة… بس البلد لازم تبقى آمنة.', when: { job: 'police' } },
    { t: 'العيال بتحب الملعب، وأنا بحب أشوفهم بيلعبوا.', when: { job: 'sport' } },
    { t: 'مفيش شغل دلوقتي… بدور على أي حاجة تشغلني.', when: { job: 'none' } },
  ],

  /* ---------- النوم ---------- */
  sleep: [
    { t: 'تعبان… محتاج أنام شوية.', when: { energy: [0, 45] } },
    { t: 'الشغل خلص… ودلوقتي دور السرير.', when: { energy: [30, 70] } },
    { t: 'مرة واحدة أنام بدري… يمكن أصحى فايق.', when: { energy: [40, 80] } },
    { t: 'الساعة بقت كتير، والباقي بكرة.', when: { hour: [21, 23] } },
    { t: 'نومة صغيرة وأصحى أشوف الدنيا.', when: { hour: [14, 17] } },
    { t: 'أنا مش تعبان… بس مفيش حاجة أعملها.', when: { mood: [0, 50], hour: [21, 23] } },
    { t: 'ورايا شغل بدري، لازم أنام من بدري.', when: { job: 'cook', hour: [20, 23] } },
    { t: 'قفلت المحل… يلا البيت والسرير.', when: { job: 'shop', hour: [20, 23] } },
    { t: 'يوم طويل، والنوم راحة.', when: { hour: [21, 23] } },
    { t: 'بكرة يوم جديد، ربنا يسهّل.', when: { hour: [22, 23] } },
    { t: 'أحلامي أحسن من الواقع شوية… يلا، ننام.', when: { mood: [0, 45] } },
    { t: 'لسه بدري على النوم… بس أنا خلصان.', when: { hour: [18, 21], energy: [0, 35] } },
    { t: 'مش قادر أفتح عيني من كتر الشغل.', when: { energy: [0, 25] } },
  ],

  /* ---------- الجوع ---------- */
  hungry: [
    { t: 'بطني بتزعق من الجوع.', when: { hunger: [70, 100] } },
    { t: 'ريحة الأكل واخدة عقلي.', when: { hunger: [60, 100] } },
    { t: 'مش هقدر أكمل كده، لازم أكل.', when: { hunger: [75, 100] } },
    { t: 'جنيهين وحبة فول وهبقى تمام.', when: { money: [0, 120], hunger: [55, 100] } },
    { t: 'النهاردة هجيب ساندوتش وأنا راجع.', when: { money: [60, 100000], hour: [12, 20] } },
    { t: 'صايم؟ لأ… بس بطني فاضية.', when: { hunger: [50, 80] } },
  ],

  /* ---------- الفواتير والإيجار ---------- */
  pay: [
    { t: 'لازم أدفع قبل ما الدنيا تتقلب.', when: { money: [120, 100000] } },
    { t: 'الفاتورة جاية، والفلوس بالعافية.', when: { money: [0, 200] } },
    { t: 'أنت تدفع وتقعد مرتاح… أحسن من وجع الدماغ.', when: { money: [200, 100000] } },
    { t: 'عداد النور بيجري أسرع مني.', when: { powerCut: false } },
    { t: 'القعدة في الضلمة دي مذلة… لازم أدفع.', when: { powerCut: true } },
  ],
  rent: [
    { t: 'الإيجار جاي، ولازم ألمّ المبلغ.', when: { money: [0, 400] } },
    { t: 'صاحب العمارة بيسأل كل شهر… الله يعين.', when: { mood: [0, 60] } },
    { t: 'الشقة بقت غالية، بس مفيش مكان تاني.', when: { money: [0, 350] } },
    { t: 'الحمد لله، الإيجار جاهز قبل الميعاد.', when: { money: [400, 100000] } },
  ],
  broke: [
    { t: 'الفلوس خلصت وأنا لسه في نص الشهر.', when: { money: [0, 40] } },
    { t: 'مفيش جنيه في جيبي… مش عارف أعمل إيه.', when: { money: [0, 15] } },
    { t: 'لو اليومية النهاردة مشيت، هعدي.', when: { money: [0, 60], job: 'none' } },
    { t: 'العمدة بياخد الضرايب… وأنا مش لاقي فكة.', when: { money: [0, 80], taxRate: [0.01, 1] } },
  ],

  /* ---------- الحياة الاجتماعية ---------- */
  social: [
    { t: 'قهوة مع الناس أحلى من قعدة البيت.', when: { hour: [15, 23] } },
    { t: 'الدنيا بسيطة، والضحكة ببلاش.', when: { mood: [55, 100] } },
    { t: 'الحكاية مع أصحابي بتنسيني التعب.', when: { mood: [40, 100] } },
    { t: 'الشارع ده فيه حياة… كل واحد وراه حكاية.', when: {} },
    { t: 'هعدي على الجامع وأرجع البيت مرتاح.', when: { hour: [12, 21] } },
    { t: 'فيه ماتش في الشارع… تعال ننزل نتفرج.', when: { recentMatch: [0, 90] } },
    { t: 'الشرطة واقفة على ناصية الشارع… حصل حاجة؟', when: { recentCrime: [0, 120] } },
    { t: 'لسه سامع صوت عربيات الشرطة… ربنا يستر.', when: { recentPolice: [0, 120] } },
    { t: 'فرح في الحارة… الناس كلها بتهنّي.', when: { recentWedding: [0, 240] } },
  ],
  gig: [
    { t: 'يومية هنا ويومية هناك… المهم ما نمدش إيدنا لحد.', when: { job: 'none' } },
    { t: 'الشغل الحر تعب، بس أحسن من القعدة.', when: { job: 'none', mood: [30, 100] } },
    { t: 'النهاردة توك توك، بكرة حاجة تانية.', when: { mood: [0, 55] } },
  ],
  charity: [
    { t: 'النهاردة هاخد لقمة من سبيل الخير… بكرة أحسن.', when: { money: [0, 40] } },
    { t: 'السبيل بينقذ ناس كتير… منهم أنا.', when: { money: [0, 55] } },
    { t: 'أنا مش جاي أتسوّل… جاي آكل وأمشي.', when: { mood: [0, 45] } },
    { t: 'اللي واقف على السبيل محترم… بيقسّم بالسوا.', when: { hour: [11, 15] } },
    { t: 'أكل ببلاش… وأنا اللي كنت بدفع للغير زمان.', when: { money: [0, 30], mood: [0, 40] } },
    { t: 'لقمة هنا أحسن من مفيش… وربنا كريم.', when: { money: [0, 65] } },
    { t: 'السبيل ده بيفرّج كتير… ربنا يبارك في اللي عاملينه.', when: { money: [0, 60] } },
    { t: 'طابور السبيل طويل النهاردة… كلنا في نفس الحالة.', when: { money: [0, 90], hour: [11, 16] } },
    { t: 'أنا مش بحب أقف هنا… بس العيال لازم ياكلوا.', when: { money: [0, 50], kids: [1, 9] } },
    { t: 'اللقمة الحلال ما فيهاش عيب، والعيب في السؤال.', when: { money: [0, 70] } },
  ],
  job: [
    { t: 'سامع إن فيه شغل في الورشة… يلا نجرب.', when: { job: 'none' } },
    { t: 'قعدة البيت من غير شغل بتقتل.', when: { job: 'none', mood: [0, 55] } },
    { t: 'محتاج أشتغل أي حاجة، أي حاجة.', when: { job: 'none', money: [0, 90] } },
    { t: 'الشغل ده محتاج واسطة… وأنا مش من الناس دي.', when: { job: 'none', mood: [0, 45] } },
  ],
  family: [
    { t: 'هقعد مع العيال شوية… الدنيا بتحلى بيهم.', when: { kids: [1, 9] } },
    { t: 'مراتي بتقولي قاعد كتير برة… يلا نراضيها.', when: { married: true, gender: 'm' } },
    { t: 'جوزي وعدني بطلعة الأسبوع ده.', when: { married: true, gender: 'f' } },
    { t: 'البيت ده هو اللي بيرجعلي روحي.', when: { married: true } },
    { t: 'حكاية العيال في المدرسة النهاردة كانت مضحكة.', when: { kids: [1, 9], hour: [15, 21] } },
    { t: 'لسه فاضي… نفسي أعمل بيت وأسكن.', when: { married: false, mood: [0, 60] } },
  ],
  idle: [
    { t: 'الدنيا ماشية… وأنا ماشي معاها.', when: {} },
    { t: 'قاعد أستنى حد ينده عليّا… مفيش.', when: { mood: [0, 55] } },
    { t: 'الشمس حلوة النهاردة… يلا نتمشى.', when: { hour: [9, 17] } },
    { t: 'مش لاقي حاجة أعملها… أروح القهوة.', when: { hour: [10, 22] } },
    { t: 'بلاش أفكر كتير… كله بييجي في وقته.', when: { mood: [45, 100] } },
    { t: 'الحارة هادية النهاردة.', when: { recentCrime: [9990, 100000] } },
    { t: 'نفسي أفتح محل صغير وأرتاح من الشغل عند الناس.', when: { job: 'shop' } },
    { t: 'شوفت الناس بتمشي… كل واحد مشغول بحاله.', when: {} },
    { t: 'ربنا يكرم ويسهّل.', when: { mood: [35, 100] } },
    { t: 'عربيتي مركونة تحت البيت… أول مرة أحس إني وصلت.', when: { hasCar: true } },
    { t: 'قسط العربية… كل شهر بيدق على الباب.', when: { carDebt: true } },
    { t: 'لو معايا فلوس كنت جبت عربية وتخلصت من المواصلات.', when: { hasCar: false, money: [80, 900] } },
    { t: 'فيه سابقة في ورقي… الناس بتبصلّي غير كده.', when: { record: [1, 9] } },
    { t: 'مش ناقص غير شوية فلوس وأقدر أرتاح.', when: { money: [20, 150], mood: [0, 55] } },
    { t: 'العمدة بيسأل عن الضرايب… الدنيا بقت صعبة.', when: { taxRate: [0.06, 1] } },
  ],

  /* ---------- لحظات يومية (بتتنادى بعد أحداث حقيقية) ---------- */
  ate: [
    { t: 'شبعت… الحمد لله.', when: { hunger: [0, 40], mood: [55, 100] } },
    { t: 'الأكل هنا طعمه زي البيت.', when: { mood: [40, 100] } },
    { t: 'القرش بيطير بسرعة… بس الأكل مش رفاهية.', when: { money: [0, 200] } },
    { t: 'أكلت وأنا واقف… مش فاضي أقعد.', when: { job: 'craft' } },
    { t: 'أحلى لقمة هي اللي بعد يوم شغل طويل.', when: { hour: [14, 23] } },
    { t: 'الطعم حلو، بس المِلح زيادة شوية.', when: { mood: [30, 70] } },
    { t: 'لقمة وخلاص… عايز أرجع البيت.', when: { energy: [0, 45] } },
    { t: 'أكلت مع زمايلي، والضحك كان أحلى من الأكل.', when: { hour: [12, 16] } },
  ],
  wage: [
    { t: 'الحمد لله، اليومية وصلت.', when: { job: 'craft' } },
    { t: 'اليومية مشيت النهاردة… كل قرش بشقاه.', when: { mood: [0, 60] } },
    { t: 'قبضت النهاردة… هحوش جزء وأصرف جزء.', when: { money: [300, 100000] } },
    { t: 'أول ما أخد الفلوس، هعدي على البقالة.', when: { hour: [16, 21] } },
    { t: 'لو الشغل كمل كده، هقدر أسدد اللي ورايا.', when: { money: [0, 200] } },
    { t: 'شغل النهاردة كان تقيل… واليومية على قدّه.', when: { job: 'craft' } },
    { t: 'معايا فلوس في الجيبي… أحسن من امبارح.', when: { money: [50, 800] } },
    { t: 'اليومية راحت في الفواتير قبل ما توصل البيت.', when: { taxRate: [0.01, 1] } },
  ],
  wageShort: [
    { t: 'اليومية ناقصة النهاردة… وصلت متأخر.', when: { job: 'craft' } },
    { t: 'لو وصلت بدري، كنت خدت الشيفت كامل.', when: { mood: [0, 60] } },
    { t: 'اتأخرت… والخصم على القد.', when: {} },
    { t: 'الشغل مابقاش فيه بركة زي الأول.', when: {} },
  ],
  shopped: [
    { t: 'جبت الحاجة… يلا البيت.', when: {} },
    { t: 'باقي حاجات تانية الأسبوع الجاي.', when: { money: [0, 250] } },
    { t: 'كل مرة أطلع من السوق أدفع أكتر.', when: { mood: [0, 60] } },
    { t: 'جبت خضار طازة… النهاردة أكلة حلوة.', when: { hour: [8, 17] } },
    { t: 'الشوال تقل… بس البيت مش هيفضل فاضي.', when: {} },
    { t: 'سألت على السعر في تلات محلات… كله غالي.', when: { money: [0, 300] } },
    { t: 'جبت حاجة حلوة للعيال.', when: { kids: [1, 9] } },
  ],
  scored: [
    { t: 'جون! أنا هدف دلوقتي.', when: {} },
    { t: 'شوفتوا الكورة دي؟', when: {} },
    { t: 'يلا نعمل تاني!', when: {} },
    { t: 'الكورة دي أحلى من اللي في التليفزيون.', when: { hour: [15, 20] } },
    { t: 'اللاعب عايز يجري وأنا لسه بتعب.', when: { energy: [0, 45] } },
  ],
  queue: [
    { t: 'الطابور طويل النهاردة…', when: { hour: [9, 20] } },
    { t: 'دوري جاي، أستنى شوية.', when: {} },
    { t: 'الدنيا كلها واقفة في نفس الطابور.', when: { mood: [0, 60] } },
    { t: 'أخلص بسرعة، لسه ورايا مشاوير.', when: { hour: [8, 14] } },
    { t: 'البياع بيخدم على مهله… بس الشغل كفاءة.', when: { mood: [45, 100] } },
  ],
  billPaid: [
    { t: 'دفعت الفاتورة… باقي الإيجار.', when: { hour: [10, 20] } },
    { t: 'نور ومايه… وباقي الشهر طويل.', when: { money: [0, 300] } },
    { t: 'أول ما النور اتوصل تاني، حسّيت إني بني آدم.', when: { powerCut: false } },
    { t: 'الحمد لله، حساب النور اتظبط النهاردة.', when: { mood: [40, 100] } },
  ],
  rentPaid: [
    { t: 'الإيجار اتسدد… ربنا يكرم.', when: { mood: [45, 100] } },
    { t: 'مرت الشهر… يلا نلمّ اللي جاي.', when: { money: [0, 250] } },
    { t: 'صاحب العمارة النهاردة كان مبسوط… أول مرة.', when: { mood: [35, 100] } },
    { t: 'دفعت الإيجار ومش باقي معايا غير الفكة.', when: { money: [0, 120] } },
  ],
  newHome: [
    { t: 'أخيراً بقى عندي بيت باسمي…', when: {} },
    { t: 'شقتي الجديدة… ربنا يبارك.', when: {} },
    { t: 'البيت ده أول حاجة امتلكتها في حياتي.', when: { money: [100, 100000] } },
    { t: 'لسه محتاج أثبّت شوية حاجات في الشقة.', when: { hour: [10, 18] } },
  ],
  movedOut: [
    { t: 'أول مرة أسكن لوحدي… الدنيا كبيرة.', when: {} },
    { t: 'الإيجار مسؤولية… يلا نشوف.', when: { money: [0, 300] } },
    { t: 'سايب بيت أهلي… بس لازم أعتمد على نفسي.', when: {} },
    { t: 'الشقة صغيرة، بس فيها راحتي.', when: { mood: [40, 100] } },
  ],
  newCar: [
    { t: 'أخيراً بقى معايا عربية…', when: { hasCar: true } },
    { t: 'أول مرة أسوق حاجة باسمي.', when: { hasCar: true } },
    { t: 'العربية دي هتوفر عليّا مشاوير كتير.', when: { hasCar: true } },
    { t: 'هغسلها النهاردة وأروح مشوار على البحر.', when: { mood: [55, 100], hour: [8, 17] } },
  ],
  carInstallment: [
    { t: 'قسط كل شهر… بس العربية بقت تحت البيت.', when: { carDebt: true } },
    { t: 'المقدم دفعته، والباقي على ربنا.', when: { carDebt: true } },
    { t: 'كل يوم جنيه في العربية أحسن من مشي في الشمس.', when: { carDebt: true } },
    { t: 'القسط تقل… بس ما ينفعش أتأخر.', when: { carDebt: true, money: [0, 200] } },
  ],
  robbed: [
    { t: 'حاجتي اتسرقت… مين دخل البيت؟', when: { recentCrime: [0, 480] } },
    { t: 'الفلوس اللي كنت بجمعها… راحت.', when: { recentCrime: [0, 480] } },
    { t: 'لازم أبلّغ القسم حالًا.', when: { recentCrime: [0, 240] } },
    { t: 'قفل الباب بقى أهم من أي حاجة تانية.', when: { recentCrime: [0, 900] } },
    { t: 'الواحد ما يقدرش ينام مرتاح بعد كده.', when: { recentCrime: [0, 900], mood: [0, 60] } },
  ],
  mugged: [
    { t: 'حسبي الله ونعم الوكيل…', when: { recentCrime: [0, 300] } },
    { t: 'الشارع بقى خطر بالليل.', when: { recentCrime: [0, 300] } },
    { t: 'لازم أبلغ الشرطة… مش هسكت.', when: { recentCrime: [0, 240] } },
    { t: 'مش هخرج لوحدي بعد المغرب تاني.', when: { hour: [18, 23] } },
  ],
  officerCase: [
    { t: 'مفيش شهود… صعب نلاقي حد.', when: { job: 'police' } },
    { t: 'الحرامي عارف يغطي آثاره.', when: { job: 'police' } },
    { t: 'لو الشارع فيه كاميرات، كنا خلصنا.', when: { job: 'police', treasury: [0, 500] } },
    { t: 'الحالة اتقفلت قبل ما أوصل… تمام.', when: { job: 'police' } },
    { t: 'الدورية الجديدة هتغطي الشارع ده أكتر.', when: { job: 'police' } },
  ],
  kidBorn: [
    { t: 'ربنا يحفظه… بقى عندي طفل جديد.', when: {} },
    { t: 'السهر بقى على العيل الصغير.', when: {} },
    { t: 'دعواتي إنه يكبر على خير.', when: {} },
    { t: 'شبه أبوه في الضحكة.', when: { married: true } },
    { t: 'البيت بقى فيه صوت تاني… وحياة.', when: { mood: [50, 100] } },
  ],
  grown: [
    { t: 'كبرت… لازم أشتغل وأعتمد على نفسي.', when: { child: false } },
    { t: 'أول خطوة: شغل، وبعدها شقة.', when: { job: 'none' } },
    { t: 'بقيت راجل… أو ست… المهم أعتمد على نفسي.', when: {} },
    { t: 'أمي لسه بتقولي اتغطى كويس.', when: { married: false } },
  ],
  love: [
    { t: 'مش عارف أقولها إزاي…', when: { gender: 'm' } },
    { t: 'كل ما أشوفه بنسى الكلام.', when: {} },
    { t: 'قلبي بيدق بسرعة لما بتيجي.', when: {} },
    { t: 'حكاية الحب دي مش سهلة زي ما بيقولوا.', when: { mood: [0, 70] } },
  ],
  jobFail: [
    { t: 'مفيش شغل هنا… يلا نجرب مكان تاني.', when: { job: 'none' } },
    { t: 'كل ما أروح مكان يقولولي تعال بكرة.', when: { job: 'none' } },
    { t: 'الشغل محتاج واسطة… وأنا مش معايا.', when: { job: 'none', money: [0, 200] } },
    { t: 'هفضل أدور… القعدة من غير شغل بتوجع.', when: { job: 'none' } },
  ],
  taxPaid: [
    { t: 'دفعت ضريبة الحارة… ولسه الفواتير.', when: { taxRate: [0.01, 1] } },
    { t: 'العمدة بياخد من اللي عنده واللي معندوش.', when: { taxRate: [0.05, 1], money: [0, 150] } },
    { t: 'الضريبة بترجع للحارة في شكل نور وشارع نضيف… يارب.', when: { taxRate: [0.01, 1], treasury: [200, 100000] } },
  ],

  /* ---------- الكلام مع الناس ---------- */
  greet: [
    { t: 'إزيك يا {n}؟', when: {} },
    { t: 'صباح الخير يا {n}.', when: { hour: [5, 11] } },
    { t: 'مساء الخير يا {n}.', when: { hour: [17, 23] } },
    { t: 'شفتك من بعيد قلت أسلم عليك.', when: {} },
    { t: 'إيه الأخبار يا {n}؟', when: {} },
    { t: 'إنت لسه شغال لحد دلوقتي يا {n}؟', when: { hour: [19, 23] } },
  ],
  small: [
    { t: 'الدنيا غالية النهاردة…', when: {} },
    { t: 'الشغل تعب، بس الحمد لله.', when: {} },
    { t: 'الجو حلو النهاردة يا {n}.', when: { hour: [7, 18] } },
    { t: 'عرفت إن سعر الطماطم نزل شوية؟', when: {} },
    { t: 'عيالك عاملين إيه يا {n}؟', when: { married: true } },
    { t: 'فيه سرقة في الحارة… خلي بالك من بيتك.', when: { recentCrime: [0, 300] } },
    { t: 'الماتش اللي في الشارع كان حلو… الكورة لسه واقفة هناك.', when: { recentMatch: [0, 200] } },
  ],
  friends: [
    { t: 'لو احتجت حاجة قولي، أنا موجود.', when: { aff: [45, 100] } },
    { t: 'تعالى نروح المولد مع بعض.', when: { aff: [45, 100] } },
    { t: 'قعدتنا دي أحلى حاجة في اليوم.', when: { aff: [45, 100] } },
    { t: 'إنت من الناس اللي الواحد بيطمنلهم.', when: { aff: [45, 100] } },
    { t: 'خليك فاكر إن بابي مفتوح ليك.', when: { aff: [45, 100] } },
  ],
  reply: [
    { t: 'الحمد لله، ماشية.', when: {} },
    { t: 'أهلاً بيك يا صاحبي.', when: {} },
    { t: 'والله الدنيا مشغولة…', when: {} },
    { t: 'إنت قولت إيه؟', when: {} },
    { t: 'تسلم يا غالي.', when: { aff: [20, 100] } },
    { t: 'يلا ربنا يكرم.', when: {} },
  ],
  argue: [
    { t: 'ما تتكلمش في حاجة مش بتفهم فيها!', when: { mood: [0, 55] } },
    { t: 'أنا مش فاضي لكلامك ده.', when: { mood: [0, 60] } },
    { t: 'بلاش تقلب المواجع.', when: {} },
    { t: 'كل مرة نفس الحكاية معاك.', when: { aff: [0, 40] } },
  ],
  customer: [
    { t: 'عندك {p}؟', when: {} },
    { t: 'إزيك يا {n}، عايز {p}.', when: {} },
    { t: 'إيه الجديد النهاردة؟', when: {} },
    { t: 'هات لي {p} الله يكرمك.', when: {} },
    { t: 'حاسبك كويس النهاردة… عايز {p}.', when: { money: [120, 100000] } },
  ],
  seller: [
    { t: 'اتفضل، طازة النهاردة.', when: {} },
    { t: 'خده يا حاج… ربنا يسهّل.', when: {} },
    { t: 'ده أحسن اللي عندي.', when: {} },
    { t: 'تحت أمرك يا {n}.', when: {} },
    { t: 'آخر حاجة فاضلة من النوع ده.', when: { hour: [18, 22] } },
  ],
};

/* ============================================================
   المحرّك
   ============================================================ */
export class DialogueEngine {
  constructor() {
    this.recent = [];         /* [{ t, at, rid }] آخر الجُمل على مستوى الحارة */
    this.picks = 0;
  }

  reset() { this.recent = []; this.picks = 0; }

  /* آخر مرة الجملة اتقالت على مستوى الحارة (بالدقايق) */
  lastSaid(text) {
    let best = null;
    for (const e of this.recent) if (e.t === text && (!best || e.at > best.at)) best = e;
    return best;
  }

  candidates(sim, r, topic, ctx) {
    const pool = LINES[topic] || [];
    return pool.filter(entry => fits(entry.when, ctx));
  }

  /* اختيار جملة: فلترة بالـcooldown، وبعدها اختيار موزون
     (الجملة اللي ليها شرط أدق بتاخد وزن أكبر، واللي بقالها مدة ما اتقالتش وزن أكبر) */
  pick(sim, r, topic, extra = {}) {
    const ctx = contextOf(sim, r, extra);
    const pool = this.candidates(sim, r, topic, ctx);
    if (!pool.length) return '';

    r.dlg = r.dlg || { used: {}, recent: [] };
    const now = sim.minute;
    const lastSelf = (t) => (r.dlg.used[t] != null ? r.dlg.used[t] : -1e9);
    const lastAny = (t) => {
      const g = this.lastSaid(t);
      return g ? g.at : -1e9;
    };

    /* ١) استبعاد اللي لسه اتقال (للشخص نفسه أو للحارة) */
    let cands = pool.filter((e) => {
      if (r.dlg.recent.includes(e.t)) return false;
      if (r.dlg.usedDay && r.dlg.usedDay[e.t] === sim.day) return false;   /* نفس الجملة مرة في اليوم */
      if (now - lastSelf(e.t) < LINE_COOLDOWN) return false;
      const g = this.lastSaid(e.t);
      if (g && g.rid !== r.id && now - g.at < LINE_GLOBAL_COOLDOWN) return false;
      if (e.t === r.lastLine) return false;
      return true;
    });

    /* ٢) لو كله في الـcooldown: نختار الأقدم استخدامًا (ومش آخر جملة) */
    if (!cands.length) {
      cands = pool.filter(e => e.t !== r.lastLine);
      if (!cands.length) cands = pool;
      const oldest = cands.reduce((a, b) => (lastSelf(a.t) <= lastSelf(b.t) ? a : b));
      this.record(sim, r, topic, oldest.t);
      return oldest.t;
    }

    /* ٣) اختيار موزون */
    const weights = cands.map((e) => {
      const spec = e.when ? Object.keys(e.when).length : 0;
      const sinceSelf = Math.min(4, Math.max(0, (now - lastSelf(e.t)) / 720));   /* نصف يوم = ٤ */
      const sinceAny = Math.min(3, Math.max(0, (now - lastAny(e.t)) / 480));
      return 1 + 0.7 * spec + sinceSelf + sinceAny;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, idx = 0;
    for (; idx < cands.length - 1; idx++) {
      roll -= weights[idx];
      if (roll <= 0) break;
    }
    const chosen = cands[idx];
    this.record(sim, r, topic, chosen.t);
    return chosen.t;
  }

  record(sim, r, topic, text) {
    r.dlg = r.dlg || { used: {}, recent: [], usedDay: {} };
    r.dlg.usedDay = r.dlg.usedDay || {};
    r.dlg.usedDay[text] = sim.day;
    r.dlg.used[text] = sim.minute;
    r.dlg.recent.push(text);
    if (r.dlg.recent.length > RECENT_MEMORY) r.dlg.recent.shift();
    const keys = Object.keys(r.dlg.used);
    if (keys.length > 60) {
      /* تنظيف: اسيب آخر ٤٠ جملة */
      const sorted = keys.sort((a, b) => r.dlg.used[a] - r.dlg.used[b]);
      for (const k of sorted.slice(0, keys.length - 40)) delete r.dlg.used[k];
    }
    this.recent.push({ t: text, at: sim.minute, rid: r.id, topic });
    if (this.recent.length > 160) this.recent.shift();
    this.picks++;
  }

  /* نسبة التكرار: كام مرة نفس الجملة اتقالت ورا بعض لنفس الشخص */
  stats() {
    const counts = new Map();
    for (const e of this.recent) counts.set(e.t, (counts.get(e.t) || 0) + 1);
    let dup = 0;
    for (const v of counts.values()) if (v > 1) dup += v - 1;
    return { total: this.recent.length, duplicate: dup, unique: counts.size, picks: this.picks };
  }
}
