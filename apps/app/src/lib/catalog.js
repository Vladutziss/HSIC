import { tr } from "./i18n.js";
// Paths decide which creature hatches from the egg; habits come from a
// predefined catalog or are created by the player.

export const PATHS = {
  studiu: {
    id: "studiu",
    label: tr("Studiu"),
    cls: tr("Cărturar"),
    icon: "book",
    color: "#5cb8ff",
    pitch: tr("Teme, lecții, examene, concentrare."),
    egg: tr("Oul tău va deveni un Cărturar."),
  },
  sport: {
    id: "sport",
    label: tr("Sport"),
    cls: tr("Atlet"),
    icon: "dumbbell",
    color: "#ff7b47",
    pitch: tr("Forță, rezistență și energie."),
    egg: tr("Oul tău va deveni un Atlet."),
  },
  bani: {
    id: "bani",
    label: tr("Bani"),
    cls: tr("Negustor"),
    icon: "coins",
    color: "#ffc542",
    pitch: tr("Bani de buzunar, economii, proiecte proprii."),
    egg: tr("Oul tău va deveni un Negustor."),
  },
  minte: {
    id: "minte",
    label: tr("Minte"),
    cls: tr("Înțelept"),
    icon: "brain",
    color: "#3fe0a5",
    pitch: tr("Calm, somn bun, mai puțin stres."),
    egg: tr("Oul tău va deveni un Înțelept."),
  },
  creativ: {
    id: "creativ",
    label: tr("Creativitate"),
    cls: tr("Bard"),
    icon: "palette",
    color: "#c58bff",
    pitch: tr("Artă, muzică, scris."),
    egg: tr("Oul tău va deveni un Bard."),
  },
};
export const PATH_LIST = Object.values(PATHS);

export const DEFAULT_NAMES = {
  sport: [tr("Fulger"), tr("Sprint"), tr("Titan")],
  studiu: [tr("Pana"), tr("Socrat"), tr("Sigma")],
  bani: [tr("Bănuț"), tr("Galben"), tr("Ducat")],
  minte: [tr("Zen"), tr("Lotus"), tr("Briza")],
  creativ: [tr("Ecou"), tr("Lira"), tr("Pensula")],
};

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

// diff: 1 = ușor, 2 = mediu, 3 = greu
export const CATALOG = [
  { id: "gym", cat: "sport", name: tr("Antrenament la sală"), icon: "dumbbell", diff: 3, days: [1, 3, 5], time: "18:00", target: tr("45 de minute") },
  { id: "run", cat: "sport", name: tr("Alergare"), icon: "footprints", diff: 2, days: [2, 4, 6], time: "07:30", target: tr("3 km") },
  { id: "steps", cat: "sport", name: tr("10.000 de pași"), icon: "activity", diff: 1, days: EVERY_DAY, time: null, target: tr("10.000 de pași") },
  { id: "stretch", cat: "sport", name: tr("Stretching"), icon: "person", diff: 1, days: EVERY_DAY, time: "08:00", target: tr("10 minute") },
  { id: "pushups", cat: "sport", name: tr("Flotări și abdomene"), icon: "flame", diff: 2, days: EVERY_DAY, time: null, target: tr("3 serii") },

  { id: "homework", cat: "studiu", name: tr("Teme pentru a doua zi"), icon: "notebook", diff: 2, days: WEEKDAYS, time: "16:30", target: tr("toate temele pentru a doua zi") },
  { id: "exam", cat: "studiu", name: tr("Pregătire pentru examen"), icon: "target", diff: 3, days: EVERY_DAY, time: "18:00", target: tr("o oră pe materia de examen") },
  { id: "review", cat: "studiu", name: tr("Recapitulare după ore"), icon: "lightbulb", diff: 1, days: WEEKDAYS, time: null, target: tr("15 minute din ce ai învățat azi") },
  { id: "plan", cat: "studiu", name: tr("Planifică ziua de mâine"), icon: "pen", diff: 1, days: WEEKDAYS, time: "21:00", target: tr("trei lucruri pentru mâine") },
  { id: "study", cat: "studiu", name: tr("Sesiune de studiu"), icon: "graduation", diff: 3, days: WEEKDAYS, time: "17:00", target: tr("50 de minute fără telefon") },
  { id: "read", cat: "studiu", name: tr("Citit"), icon: "book", diff: 1, days: EVERY_DAY, time: "22:00", target: tr("20 de pagini") },
  { id: "math", cat: "studiu", name: tr("Probleme de matematică"), icon: "sigma", diff: 2, days: EVERY_DAY, time: null, target: tr("3 probleme rezolvate") },
  { id: "lang", cat: "studiu", name: tr("Limbă străină"), icon: "languages", diff: 1, days: EVERY_DAY, time: null, target: tr("15 minute") },
  { id: "cards", cat: "studiu", name: tr("Recapitulare cu fișe"), icon: "layers", diff: 1, days: EVERY_DAY, time: null, target: tr("20 de fișe") },

  { id: "expenses", cat: "bani", name: tr("Notează cheltuielile"), icon: "receipt", diff: 1, days: EVERY_DAY, time: "21:30", target: tr("toate cheltuielile zilei") },
  { id: "save", cat: "bani", name: tr("Pune bani deoparte"), icon: "piggy", diff: 2, days: [1], time: null, target: tr("10% din venit") },
  { id: "invest", cat: "bani", name: tr("Învață despre investiții"), icon: "trending", diff: 1, days: [2, 4], time: null, target: tr("un articol sau un capitol") },
  { id: "project", cat: "bani", name: tr("Proiectul propriu"), icon: "rocket", diff: 3, days: WEEKDAYS, time: "19:00", target: tr("o oră de lucru concentrat") },
  { id: "nobuy", cat: "bani", name: tr("Fără cumpărături impulsive"), icon: "bag", diff: 1, days: EVERY_DAY, time: null, target: tr("nimic neplanificat") },

  { id: "meditate", cat: "minte", name: tr("Meditație"), icon: "wind", diff: 1, days: EVERY_DAY, time: "07:00", target: tr("10 minute") },
  { id: "sleep", cat: "minte", name: tr("Somn la timp"), icon: "moon", diff: 2, days: EVERY_DAY, time: "23:00", target: tr("în pat până la 23:00") },
  { id: "journal", cat: "minte", name: tr("Jurnal"), icon: "notebook", diff: 1, days: EVERY_DAY, time: "22:30", target: tr("trei rânduri") },
  { id: "water", cat: "minte", name: tr("Hidratare"), icon: "droplets", diff: 1, days: EVERY_DAY, time: null, target: tr("2 litri de apă") },
  { id: "nophone", cat: "minte", name: tr("Dimineață fără telefon"), icon: "phoneoff", diff: 2, days: EVERY_DAY, time: "07:00", target: tr("prima oră după trezire") },

  { id: "draw", cat: "creativ", name: tr("Desen"), icon: "brush", diff: 2, days: EVERY_DAY, time: null, target: tr("30 de minute") },
  { id: "music", cat: "creativ", name: tr("Exersează la instrument"), icon: "music", diff: 2, days: EVERY_DAY, time: "20:00", target: tr("30 de minute") },
  { id: "write", cat: "creativ", name: tr("Scris creativ"), icon: "feather", diff: 2, days: EVERY_DAY, time: null, target: tr("300 de cuvinte") },
  { id: "photo", cat: "creativ", name: tr("Fotografie"), icon: "camera", diff: 1, days: [0, 6], time: null, target: tr("o fotografie bună") },
  { id: "craft", cat: "creativ", name: tr("Proiect creativ"), icon: "lightbulb", diff: 3, days: [6], time: "11:00", target: tr("două ore") },
];

export const RECOMMENDED = {
  sport: ["gym", "steps", "sleep", "water"],
  studiu: ["homework", "study", "review", "nophone"],
  bani: ["expenses", "project", "invest", "read"],
  minte: ["meditate", "sleep", "journal", "steps"],
  creativ: ["draw", "write", "read", "meditate"],
};

export const ICON_KEYS = [
  "dumbbell", "footprints", "activity", "person", "flame", "bike", "mountain", "heart",
  "graduation", "book", "sigma", "languages", "layers", "calculator", "lightbulb", "target",
  "receipt", "piggy", "trending", "rocket", "bag", "wallet", "briefcase", "coins",
  "wind", "moon", "notebook", "droplets", "phoneoff", "salad", "coffee", "sun",
  "brush", "music", "feather", "camera", "palette", "pen", "star", "sparkles",
];

// Categorical slots (validated for CVD and contrast on the dark panel).
export const HABIT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const MAX_HABITS = 20; // active habits; colours repeat past HABIT_COLORS.length, and a day counts at most RULES.habitsPerDay ticked ones (engine.js)

export function nextColor(habits) {
  const used = new Set(habits.filter((h) => !h.archivedAt).map((h) => h.color));
  return HABIT_COLORS.find((c) => !used.has(c)) || HABIT_COLORS[habits.length % HABIT_COLORS.length];
}

export const uid = (prefix = "") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function habitFromCatalog(item, habits, today) {
  return {
    id: uid("h"),
    catalogId: item.id,
    name: item.name,
    icon: item.icon,
    cat: item.cat,
    diff: item.diff,
    days: [...item.days],
    time: item.time,
    target: item.target,
    color: nextColor(habits),
    createdAt: today,
  };
}
