import { getLocale, tr } from "./i18n.js";
// Calendar helpers. Days are local "YYYY-MM-DD" keys, which sort as strings.

export const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (key) => new Date(key + "T00:00:00");
export const todayKey = () => dayKey(new Date());

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days from a to b (positive when b is later). */
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday, like Date#getDay. */
export const weekday = (key) => parseDay(key).getDay();
export const mondayOf = (key) => addDays(key, -((weekday(key) + 6) % 7));
export const monthKey = (key) => key.slice(0, 7);

export function dayRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function monthsBetween(fromKey, toKey) {
  const out = [];
  let [y, m] = fromKey.slice(0, 7).split("-").map(Number);
  const [ty, tm] = toKey.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Day and month names, written out so output does not depend on the browser's locale data. The constants keep their
// original names (RO_*) but hold the names in the page language (Romanian, or English when the page is in English).
export const NAMES = {
  ro: {
    days: ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"],
    short: ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"],
    min: ["D", "L", "Ma", "Mi", "J", "V", "S"],
    months: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
    monthsShort: ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"],
  },
  en: {
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    min: ["S", "M", "Tu", "W", "Th", "F", "Sa"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
};
const NAME = NAMES[getLocale()] || NAMES.ro;
export const RO_DAYS = NAME.days;
export const RO_DAYS_SHORT = NAME.short;
export const RO_DAYS_MIN = NAME.min;
export const RO_MONTHS = NAME.months;
export const RO_MONTHS_SHORT = NAME.monthsShort;

export const fmtDay = (key) => {
  const d = parseDay(key);
  return `${d.getDate()} ${RO_MONTHS_SHORT[d.getMonth()]}`;
};
export const fmtLong = (key) => {
  const d = parseDay(key);
  return `${RO_DAYS[d.getDay()]}, ${d.getDate()} ${RO_MONTHS[d.getMonth()]}`;
};
export const fmtMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${RO_MONTHS[m - 1]} ${y}`;
};

export function relDay(key, today) {
  const n = diffDays(key, today);
  if (n === 0) return tr("azi");
  if (n === 1) return tr("ieri");
  if (n === -1) return tr("mâine");
  if (n > 1 && n < 7) return tr("acum {n} zile", { n });
  return fmtDay(key);
}

// Times of day are "HH:MM" strings or minutes after midnight.
export const parseHM = (hm) => {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtHM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
/** "HH:MM" -> how the page language writes a time: "16:25" in Romanian, "4:25 PM" in English (stored times stay 24-hour). */
export function fmt12(hm) {
  const min = typeof hm === "number" ? hm : parseHM(hm);
  if (min == null) return "";
  const h = Math.floor(min / 60) % 24;
  if (getLocale() === "ro") return `${pad(h)}:${pad(min % 60)}`;
  return `${h % 12 || 12}:${pad(min % 60)} ${h < 12 ? "AM" : "PM"}`;
}
/** Minutes -> "16:00" in Romanian, "4 PM" in English, for the hour axis of the calendar. */
export const fmtHour12 = (min) => {
  const h = Math.floor(min / 60) % 24;
  return getLocale() === "ro" ? `${pad(h)}:00` : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};
export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
