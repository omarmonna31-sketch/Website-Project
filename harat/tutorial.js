/* ============================================================
   الشرح التفاعلي: خطوات مربوطه بالفعل اللي بيحصل في الحارة
   ============================================================ */

export const TUTORIAL_STEPS = [
  {
    id: 'look',
    tab: 'people',
    title: 'اتعرف على الناس',
    body: 'الحارة فيها ناس بتحب، بتشتغل، وبتتخانق. اضغط على أي ساكن في الشارع أو من تبويب «الناس» وافتح ملفه — هتلاقي شغله وفلوسه وأصحابه.',
    goal: 'افتح ملف ساكن واحد',
    check: (sim, f) => !!f.profileOpened,
  },
  {
    id: 'food',
    tab: null,
    title: 'الأكل أهم حاجة',
    body: 'كل ما حد يجوع بيبدأ يدور على أكل. فيه مطاعم وعربيات أكل في الحارة، وفي الجمعية اللي بتساعد اللي مش معاه فلوس.',
    goal: 'خلّي حد ياكل مرة',
    check: (sim) => sim.stats.meals >= 1,
  },
  {
    id: 'enter',
    tab: 'street',
    title: 'ادخل جوه',
    body: 'المحلات والبيوت ليها جوّه. اضغط على الباب أو استخدم تبويب «الشارع» وادخل — هتشوف الناس بتشتغل وتاكل وتتكلم من قريب.',
    goal: 'ادخل أي محل أو بيت',
    check: (sim, f) => !!f.enteredPlace,
  },
  {
    id: 'talk',
    tab: null,
    title: 'الكلام بيقرّب',
    body: 'الناس بتتكلم مع بعض في الشارع وفي القهاوي. العلاقات بتكبر بالكلام، ولما توصل لمية تبقى عيلة.',
    goal: 'خلّي اتنين يتكلموا',
    check: (sim) => sim.stats.talks >= 1 || sim.residents.some(r => (r.friends || []).length > 0),
  },
  {
    id: 'work',
    tab: 'town',
    title: 'الشغل رزق',
    body: 'كل واحد ليه شغل وميعاد. من تبويب «الحارة» تقدر تشوف مين بيشتغل فين، وتفتح وظايف جديدة أو تسرّح حد.',
    goal: 'يكون فيه ساكن شغال',
    check: (sim) => sim.residents.some(r => !r.child && r.jobTitle),
  },
  {
    id: 'build',
    tab: 'build',
    title: 'ابني حاجة',
    body: 'فيه أراضي فاضية في الحارة. من تبويب «بناء» اختار أرض وابني عليها محل أو مطعم — البناء بياخد وقت وفلوس والناس هتشتغل فيه.',
    goal: 'ابني مشروع واحد',
    check: (sim) => sim.stats.builds >= 1 || sim.projects.some(p => p.done),
  },
  {
    id: 'family',
    tab: 'people',
    title: 'عيله وحياة',
    body: 'اتنين بيحبوا بعض، بيتجوزوا، وبيخلفوا. العيلة بتسكن مع بعض في شقة وبتتقاسم الإيجار — والمصالح بتتولّد لوحدها.',
    goal: 'جواز أو مولود في الحارة',
    check: (sim) => sim.stats.weddings >= 1 || sim.households.length >= 2,
  },
  {
    id: 'housing',
    tab: 'town',
    title: 'سكن للناس',
    body: 'كل عمارة فيها شقق محدودة. لو الشقق خلصت الناس هتتزنق. العمدة يقدر ينقل ناس أو يقفل الإيجار في عمارة.',
    goal: 'حد يسكن في شقة',
    check: (sim) => sim.stats.housed >= 1,
  },
  {
    id: 'sleep',
    tab: null,
    title: 'الليل والنوم',
    body: 'بالليل الناس بترجع بيوتها وتنام. فيه زر «صباح» في الشريط اللي تحت لو عايز تعدّي الليل بسرعة.',
    goal: 'عدّي ليلة (أو خلّي الناس تنام)',
    check: (sim) => sim.stats.skips >= 1 || sim.residents.filter(r => sim.isAsleep(r)).length > 2,
  },
  {
    id: 'football',
    tab: 'street',
    title: 'كورة الحارة',
    body: 'الولاد بيلمّوا بعض ويلعبوا ماتش في الملعب. من تبويب «الشارع» تبدأ ماتش وتشجع فريقك.',
    goal: 'ماتش كورة واحد',
    check: (sim) => sim.stats.matches >= 1,
  },
  {
    id: 'police',
    tab: 'town',
    title: 'الأمن',
    body: 'فيه سرقات وحوادث. الشرطة بتتحرك لو فيه ظابط في القسم — ولو غابت، الحرامي بيهرب. تقدر تتحكم في تغطية الشرطة من عند العمدة.',
    goal: 'حادثة أو قبض في الحارة',
    check: (sim) => sim.stats.arrests >= 1 || sim.incidents.length > 0,
  },
  {
    id: 'cars',
    tab: 'street',
    title: 'عربيات ومشاوير',
    body: 'الناس بتشتري عربيات وتطلب مشاوير. من تبويب «الشارع» تقدر تبيع عربية أو تطلب مشوار لساكن.',
    goal: 'عربية أو مشوار واحد',
    check: (sim) => sim.stats.rides >= 1 || sim.cars.length >= 2,
  },
  {
    id: 'mayor',
    tab: 'mayor',
    title: 'العمدة',
    body: 'انت اللي بتحكم: ضرايب، خزنة، منح، غرامات، إسكان، وخدمات. افتح تبويب «العمدة» وحصّل الضرايب مرة.',
    goal: 'افتح تبويب العمدة وحصّل ضرايب',
    check: (sim, f) => !!f.mayorUsed,
  },
];

export class TutorialEngine {
  constructor(state) {
    this.state = {
      started: false, finished: false, skipped: false, paused: false,
      index: 0, done: [], flags: {}, flash: 0,
    };
    if (state) this.load(state);
  }

  get total() { return TUTORIAL_STEPS.length; }
  get step() { return TUTORIAL_STEPS[this.state.index] || null; }
  get active() { return this.state.started && !this.state.finished && !this.state.paused; }

  load(state) {
    if (!state || typeof state !== 'object') return;
    this.state = Object.assign(this.state, {
      started: !!state.started,
      finished: !!state.finished,
      skipped: !!state.skipped,
      paused: !!state.paused,
      index: Math.max(0, Math.min(TUTORIAL_STEPS.length, Number(state.index) || 0)),
      done: Array.isArray(state.done) ? state.done.slice() : [],
      flags: Object.assign({}, state.flags || {}),
      flash: 0,
    });
  }

  start() {
    this.state.started = true;
    this.state.finished = false;
    this.state.skipped = false;
    this.state.paused = false;
    if (this.state.index >= TUTORIAL_STEPS.length) this.state.index = 0;
    return this;
  }

  flag(key, value = true) {
    if (!key) return;
    this.state.flags[key] = value;
    this.tick(null);
  }

  tick(sim) {
    this.state.flash = Math.max(0, this.state.flash - 1);
    if (!this.state.started || this.state.finished || this.state.paused) return false;
    let guard = 0;
    while (this.state.index < TUTORIAL_STEPS.length && guard++ < TUTORIAL_STEPS.length) {
      const step = TUTORIAL_STEPS[this.state.index];
      if (!step) break;
      let ok = false;
      try { ok = !!step.check(sim, this.state.flags); } catch (e) { ok = false; }
      if (!ok) return false;
      if (!this.state.done.includes(step.id)) this.state.done.push(step.id);
      this.state.index++;
      this.state.flash = 6;
    }
    if (this.state.index >= TUTORIAL_STEPS.length) this.state.finished = true;
    return true;
  }

  next() {   /* المستخدم ضغط «تالي» — بنعتبر الخطوة خلصت */
    const step = this.step;
    if (!step) return this.state;
    if (!this.state.done.includes(step.id)) this.state.done.push(step.id);
    this.state.index++;
    if (this.state.index >= TUTORIAL_STEPS.length) this.state.finished = true;
    return this.state;
  }

  skip() {
    this.state.skipped = true;
    this.state.finished = true;
    this.state.done = TUTORIAL_STEPS.map(s => s.id);
    this.state.index = TUTORIAL_STEPS.length;
    return this.state;
  }

  pause(on = true) { this.state.paused = !!on; return this.state; }

  restart() {
    this.state = {
      started: true, finished: false, skipped: false, paused: false,
      index: 0, done: [], flags: {}, flash: 0,
    };
    return this.state;
  }

  progress() {
    return {
      done: this.state.done.length,
      total: this.total,
      percent: Math.round((this.state.done.length / this.total) * 100),
    };
  }

  snapshot() {
    const step = this.step;
    return {
      active: this.active,
      visible: this.state.started && !this.state.finished && !this.state.skipped,
      finished: this.state.finished,
      started: this.state.started,
      paused: this.state.paused,
      index: this.state.index,
      flash: this.state.flash > 0,
      done: this.state.done.slice(),
      progress: this.progress(),
      step: step ? { id: step.id, title: step.title, body: step.body, goal: step.goal, tab: step.tab } : null,
    };
  }

  toJSON() {
    return {
      started: this.state.started,
      finished: this.state.finished,
      skipped: this.state.skipped,
      paused: this.state.paused,
      index: this.state.index,
      done: this.state.done.slice(),
      flags: Object.assign({}, this.state.flags),
    };
  }
}
