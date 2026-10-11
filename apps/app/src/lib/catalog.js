// Paths decide which creature hatches from the egg; habits come from a
// predefined catalog or are created by the player.

export const PATHS = {
  sport: {
    id: "sport",
    label: "Sport",
    cls: "Atlet",
    icon: "dumbbell",
    color: "#ff7b47",
    pitch: "Forță, rezistență și energie.",
    egg: "Oul tău va deveni un Atlet.",
  },
  studiu: {
    id: "studiu",
    label: "Studiu",
    cls: "Cărturar",
    icon: "book",
    color: "#5cb8ff",
    pitch: "Învățare, concentrare, cunoaștere.",
    egg: "Oul tău va deveni un Cărturar.",
  },
  bani: {
    id: "bani",
    label: "Bani",
    cls: "Negustor",
    icon: "coins",
    color: "#ffc542",
    pitch: "Economii, investiții, proiecte proprii.",
    egg: "Oul tău va deveni un Negustor.",
  },
  minte: {
    id: "minte",
    label: "Minte",
    cls: "Înțelept",
    icon: "brain",
    color: "#3fe0a5",
    pitch: "Calm, somn bun, echilibru.",
    egg: "Oul tău va deveni un Înțelept.",
  },
  creativ: {
    id: "creativ",
    label: "Creativitate",
    cls: "Bard",
    icon: "palette",
    color: "#c58bff",
    pitch: "Artă, muzică, scris.",
    egg: "Oul tău va deveni un Bard.",
  },
};
export const PATH_LIST = Object.values(PATHS);

export const DEFAULT_NAMES = {
  sport: ["Fulger", "Sprint", "Titan"],
  studiu: ["Pana", "Socrat", "Sigma"],
  bani: ["Bănuț", "Galben", "Ducat"],
  minte: ["Zen", "Lotus", "Briza"],
  creativ: ["Ecou", "Lira", "Pensula"],
};

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

// diff: 1 = ușor, 2 = mediu, 3 = greu
export const CATALOG = [
  { id: "gym", cat: "sport", name: "Antrenament la sală", icon: "dumbbell", diff: 3, days: [1, 3, 5], time: "18:00", target: "45 de minute" },
  { id: "run", cat: "sport", name: "Alergare", icon: "footprints", diff: 2, days: [2, 4, 6], time: "07:30", target: "3 km" },
  { id: "steps", cat: "sport", name: "10.000 de pași", icon: "activity", diff: 1, days: EVERY_DAY, time: null, target: "10.000 de pași" },
  { id: "stretch", cat: "sport", name: "Stretching", icon: "person", diff: 1, days: EVERY_DAY, time: "08:00", target: "10 minute" },
  { id: "pushups", cat: "sport", name: "Flotări și abdomene", icon: "flame", diff: 2, days: EVERY_DAY, time: null, target: "3 serii" },

  { id: "study", cat: "studiu", name: "Sesiune de studiu", icon: "graduation", diff: 3, days: WEEKDAYS, time: "17:00", target: "50 de minute fără telefon" },
  { id: "read", cat: "studiu", name: "Citit", icon: "book", diff: 1, days: EVERY_DAY, time: "22:00", target: "20 de pagini" },
  { id: "math", cat: "studiu", name: "Probleme de matematică", icon: "sigma", diff: 2, days: EVERY_DAY, time: null, target: "3 probleme rezolvate" },
  { id: "lang", cat: "studiu", name: "Limbă străină", icon: "languages", diff: 1, days: EVERY_DAY, time: null, target: "15 minute" },
  { id: "cards", cat: "studiu", name: "Recapitulare cu fișe", icon: "layers", diff: 1, days: EVERY_DAY, time: null, target: "20 de fișe" },

  { id: "expenses", cat: "bani", name: "Notează cheltuielile", icon: "receipt", diff: 1, days: EVERY_DAY, time: "21:30", target: "toate cheltuielile zilei" },
  { id: "save", cat: "bani", name: "Pune bani deoparte", icon: "piggy", diff: 2, days: [1], time: null, target: "10% din venit" },
  { id: "invest", cat: "bani", name: "Învață despre investiții", icon: "trending", diff: 1, days: [2, 4], time: null, target: "un articol sau un capitol" },
  { id: "project", cat: "bani", name: "Proiectul propriu", icon: "rocket", diff: 3, days: WEEKDAYS, time: "19:00", target: "o oră de lucru concentrat" },
  { id: "nobuy", cat: "bani", name: "Fără cumpărături impulsive", icon: "bag", diff: 1, days: EVERY_DAY, time: null, target: "nimic neplanificat" },

  { id: "meditate", cat: "minte", name: "Meditație", icon: "wind", diff: 1, days: EVERY_DAY, time: "07:00", target: "10 minute" },
  { id: "sleep", cat: "minte", name: "Somn la timp", icon: "moon", diff: 2, days: EVERY_DAY, time: "23:00", target: "în pat până la 23:00" },
  { id: "journal", cat: "minte", name: "Jurnal", icon: "notebook", diff: 1, days: EVERY_DAY, time: "22:30", target: "trei rânduri" },
  { id: "water", cat: "minte", name: "Hidratare", icon: "droplets", diff: 1, days: EVERY_DAY, time: null, target: "2 litri de apă" },
  { id: "nophone", cat: "minte", name: "Dimineață fără telefon", icon: "phoneoff", diff: 2, days: EVERY_DAY, time: "07:00", target: "prima oră după trezire" },

  { id: "draw", cat: "creativ", name: "Desen", icon: "brush", diff: 2, days: EVERY_DAY, time: null, target: "30 de minute" },
  { id: "music", cat: "creativ", name: "Exersează la instrument", icon: "music", diff: 2, days: EVERY_DAY, time: "20:00", target: "30 de minute" },
  { id: "write", cat: "creativ", name: "Scris creativ", icon: "feather", diff: 2, days: EVERY_DAY, time: null, target: "300 de cuvinte" },
  { id: "photo", cat: "creativ", name: "Fotografie", icon: "camera", diff: 1, days: [0, 6], time: null, target: "o fotografie bună" },
  { id: "craft", cat: "creativ", name: "Proiect creativ", icon: "lightbulb", diff: 3, days: [6], time: "11:00", target: "două ore" },
];

export const RECOMMENDED = {
  sport: ["gym", "steps", "sleep", "water"],
  studiu: ["study", "read", "math", "nophone"],
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
export const MAX_HABITS = HABIT_COLORS.length;

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
