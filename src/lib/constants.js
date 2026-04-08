export const CLIENT_CODES = [
  { code: "EL", name: "Elevate Tourism" },
  { code: "HR", name: "Hard Rock Maldives" },
  { code: "SL", name: "SAii Lagoon Maldives" },
  { code: "SA", name: "Sands Suites Resort & Spa" },
  { code: "SO", name: "SO/ Maldives" },
  { code: "WD", name: "We Define Travel (Internal)" },
  { code: "WDP", name: "Profit Code" },
];

export const PAID_BY_CODES = [
  { code: "WCA", label: "Celine (Company Amex)", reimbursement: false },
  { code: "WSA", label: "Sophie (Company Amex)", reimbursement: false },
  { code: "WDA", label: "Dee (Company Amex)", reimbursement: false },
  { code: "CB", label: "Celine (Personal)", reimbursement: true },
  { code: "ST", label: "Sophie (Personal)", reimbursement: true },
  { code: "DJ", label: "Dee (Personal)", reimbursement: true },
  { code: "WD", label: "We Define Travel Direct", reimbursement: false },
  { code: "WD1", label: "WeDefine Travel Margin", reimbursement: false },
];

export const VEHICLE_TYPES = [
  { type: "Car", rate: 0.45, rateOver10k: 0.25, label: "Car — 45p/mile" },
  { type: "Motorcycle", rate: 0.24, rateOver10k: 0.24, label: "Motorcycle — 24p/mile" },
  { type: "Bicycle", rate: 0.20, rateOver10k: 0.20, label: "Bicycle — 20p/mile" },
];

export const REIMBURSEMENT_CODES = ["CB", "ST", "DJ"];

export const COMPANY_INFO = {
  name: "We Define Travel Ltd",
  address: "Brightfield Business Hub, Bakewell Road, Orton Southgate, Peterborough, PE2 6XU",
  regNumber: "11519289",
  vatNumber: "298 8706 05",
  email: "info@wedefine.travel",
  website: "www.wedefine.travel",
  director: "Dee",
  directorEmail: "dee@wedefine.travel",
};

export function getClientName(code) {
  return CLIENT_CODES.find(c => c.code === code)?.name || code;
}

export function getPaidByLabel(code) {
  return PAID_BY_CODES.find(c => c.code === code)?.label || code;
}

export function isReimbursementRequired(paidByCode) {
  return REIMBURSEMENT_CODES.includes(paidByCode);
}

export function formatMonth(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yy = String(d.getFullYear()).slice(2);
  return `${months[d.getMonth()]} ${yy}`;
}

export function formatMonthCode(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${mm}${yy}`;
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount || 0);
}

export function formatDateUK(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}