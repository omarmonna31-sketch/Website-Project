/* ============================================================
   العمدة: الأدوار والصلاحيات وأوامر إدارة الحارة
   ============================================================ */

export const MAYOR_ROLES = {
  mayor: {
    id: 'mayor',
    name: 'عمدة الحارة',
    permissions: [
      'report.read', 'tax.set', 'treasury.collect', 'treasury.grant',
      'housing.evict', 'housing.reassign', 'housing.rentals',
      'resident.fine', 'resident.removeTrespasser',
      'service.toggle', 'police.coverage', 'leader.auto',
    ],
  },
  council: {
    id: 'council',
    name: 'مجلس الحارة',
    permissions: ['report.read', 'treasury.collect', 'housing.rentals', 'service.toggle'],
  },
  observer: {
    id: 'observer',
    name: 'مراقب',
    permissions: ['report.read'],
  },
};

export const MAYOR_COMMANDS = {
  'tax.set': { label: 'ظبط نسب الضرايب', permission: 'tax.set', confirm: true, danger: true },
  'treasury.collect': { label: 'تحصيل الضرايب للخزنة', permission: 'treasury.collect', confirm: false },
  'treasury.grant': { label: 'منحة من الخزنة', permission: 'treasury.grant', confirm: true, danger: false },
  'housing.evict': { label: 'طرد من البيت', permission: 'housing.evict', confirm: true, danger: true },
  'housing.reassign': { label: 'إسكان في بيت تاني', permission: 'housing.reassign', confirm: true, danger: false },
  'housing.rentals': { label: 'قفل/فتح الإيجار', permission: 'housing.rentals', confirm: false },
  'resident.fine': { label: 'غرامة على ساكن', permission: 'resident.fine', confirm: true, danger: false },
  'resident.removeTrespasser': { label: 'إخراج متطفّل من البيت', permission: 'resident.removeTrespasser', confirm: true, danger: true },
  'service.toggle': { label: 'خدمة من خدمات الحارة', permission: 'service.toggle', confirm: false },
  'police.coverage': { label: 'تغطية الشرطة', permission: 'police.coverage', confirm: false },
  'leader.auto': { label: 'العمدة الآلي', permission: 'leader.auto', confirm: false },
};

export const TAX_LIMITS = { resident: [0, 0.15], business: [0, 0.2] };
export const COVERAGE_LEVELS = ['low', 'normal', 'high'];
export const COVERAGE_LABEL = { low: 'تغطية خفيفة', normal: 'تغطية عادية', high: 'تغطية مكثفة' };
export const SERVICES = {
  streetlights: 'نور الشوارع',
  water: 'المايه',
  police: 'خدمة الشرطة',
};
export const GRANT_LIMIT_NEEDS_CONFIRM = 500;   /* فوق كده لازم تأكيد */
export const FINE_LIMIT = 500;
export const CONFIRM_TTL = 90;                   /* التأكيد بيسقط بعد ٩٠ دقيقة محاكاة */

export function freshMayorState() {
  return {
    treasury: 0,
    tax: { resident: 0.05, business: 0.03 },
    taxArrears: {},
    services: { streetlights: true, water: true, police: true },
    policeCoverage: 'normal',
    leadership: { roleId: 'mayor', playerHolds: true, holderId: null, aiMayor: false },
    fines: [],
    history: [],
    lastCollectDay: 0,
    collectedTotal: 0,
    grantedTotal: 0,
    nextToken: 1,
  };
}
