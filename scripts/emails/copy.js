// Copy of every campaign email, in Romanian (default) and English. Subjects stay under 50 characters; each campaign has
// two subject variants (a, b) for later A/B tests. Placeholders in {{double braces}} are filled when the email is sent
// (supabase/functions/_shared/email-render.js): greeting, app_url, reply_url, unsubscribe_url, prefs_url, email.
// No offers, no countdowns, no guilt: Molt sleeps, he does not mind.

export const BRAND = {
  name: "Molted",
  // from packages/ui/base.css (theme "night") and the app icon
  colors: {
    page: "#0c0a1d",
    card: "#1a1636",
    edge: "#2e2860",
    ink: "#f3efff",
    body: "#cfc8f0",
    dim: "#9a91c9",
    gold: "#ffc542",
    onGold: "#2a1b00",
    violet: "#b19bff",
  },
  fontStack: "Nunito, 'Segoe UI', Helvetica, Arial, sans-serif",
  logo: "https://app.molted.eu/icons/icon-192.png",
  site: "https://www.molted.eu",
  contact: "molted.app@gmail.com",
};

export const SUBJECT_MAX = 50;

export const COPY = {
  onboarding_nudge: {
    ro: {
      subjects: { a: "Oul tău așteaptă prima bifă", b: "O bifă și oul prinde viață" },
      preheader: "Durează un minut: alege un obicei mic și bifează-l.",
      title: "Oul tău așteaptă prima bifă",
      paragraphs: [
        "Ai creat contul Molted, dar oul tău n-a primit încă nicio bifă. Nu trebuie să fie ceva mare.",
        "Alege un singur obicei, atât de mic încât să-l poți face azi fără efort, și bifează-l. De acolo începe totul: oul se deschide, iar personajul evoluează odată cu tine.",
      ],
      cta: "Deschide Molted",
      link: "app_url",
    },
    en: {
      subjects: { a: "Your egg is waiting for its first check", b: "One check and your egg comes alive" },
      preheader: "It takes a minute: pick one small habit and check it off.",
      title: "Your egg is waiting for its first check",
      paragraphs: [
        "You created your Molted account, but your egg has not had a single check-in yet. It does not have to be big.",
        "Pick one habit, so small you can do it today without effort, and check it off. That is where everything starts: the egg opens and your character evolves with you.",
      ],
      cta: "Open Molted",
      link: "app_url",
    },
  },

  quick_win: {
    ro: {
      subjects: { a: "Un truc mic ca bifa să rămână", b: "Prima săptămână, pe înțelesul tău" },
      preheader: "Leagă bifa de ceva ce faci deja în fiecare zi.",
      title: "Cum faci ca bifa să rămână",
      paragraphs: [
        "Ai început să bifezi, iar personajul tău a început să evolueze. Bravo pentru primii pași.",
        "Cel mai bun truc la început nu e motivația, ci un plan simplu de tipul „după ce fac X, fac Y”. De exemplu: după cafea, deschid Molted și bifez; înainte de somn, trec prin lista de azi. Studiile despre intențiile de implementare (Gollwitzer, 1999) arată că un astfel de plan ajută obiceiul să prindă.",
        "Alege azi un singur moment fix și încearcă-l o săptămână.",
      ],
      cta: "Deschide Molted",
      link: "app_url",
    },
    en: {
      subjects: { a: "A small trick to make check-ins stick", b: "Your first week, in plain words" },
      preheader: "Tie the check-in to something you already do every day.",
      title: "How to make the check-in stick",
      paragraphs: [
        "You have started checking in, and your character has started to evolve. Well done on the first steps.",
        "The best trick early on is not motivation but a simple plan of the form \"after I do X, I do Y\". For example: after coffee, I open Molted and check in; before sleep, I go through today's list. Studies on implementation intentions (Gollwitzer, 1999) show that a plan like this helps a habit take hold.",
        "Pick one fixed moment today and try it for a week.",
      ],
      cta: "Open Molted",
      link: "app_url",
    },
  },

  feature_tour: {
    ro: {
      subjects: { a: "Coach-ul AI și grupurile, în 2 minute", b: "Molted poate mai mult decât bifele" },
      preheader: "Coach-ul propune, tu confirmi. Și merge mai bine cu prieteni.",
      title: "Mai mult decât bifele",
      paragraphs: [
        "Coach-ul AI din Molted se uită la tiparele tale, îți propune schimbări concrete (de exemplu un obicei mutat pe altă zi) și măsoară dacă au ajutat. Nimic nu se schimbă până nu confirmi tu.",
        "Merge mai bine și cu cineva alături: intră într-un grup cu prietenii, ca să vă vedeți seriile și să vă trimiteți impulsuri când e nevoie.",
      ],
      cta: "Vezi ce propune coach-ul",
      link: "app_url",
    },
    en: {
      subjects: { a: "The AI coach and groups, in 2 minutes", b: "Molted does more than check-ins" },
      preheader: "The coach proposes, you confirm. It works better with friends.",
      title: "More than check-ins",
      paragraphs: [
        "Molted's AI coach looks at your patterns, proposes concrete changes (for example a habit moved to another day) and measures whether they helped. Nothing changes until you confirm it.",
        "It also works better with someone beside you: join a group with friends to see each other's streaks and send nudges when needed.",
      ],
      cta: "See what the coach proposes",
      link: "app_url",
    },
  },

  feedback: {
    ro: {
      subjects: { a: "Ne ajuți cu o părere despre Molted?", b: "O întrebare, două propoziții" },
      preheader: "Răspunde direct la acest email. Citim fiecare mesaj.",
      title: "Ce ar face Molted mai bun?",
      paragraphs: [
        "Lucrăm la Molted în patru oameni și citim fiecare răspuns.",
        "Ce ți-a plăcut, ce te-a încurcat, ce lipsește? Una-două propoziții ne ajută mult. Poți răspunde direct la acest email.",
      ],
      cta: "Scrie-ne o părere",
      link: "reply_url",
    },
    en: {
      subjects: { a: "Can you share your thoughts on Molted?", b: "One question, two sentences" },
      preheader: "Just reply to this email. We read every message.",
      title: "What would make Molted better?",
      paragraphs: [
        "Four of us build Molted, and we read every reply.",
        "What did you like, what got in your way, what is missing? A sentence or two helps a lot. You can simply reply to this email.",
      ],
      cta: "Send us your thoughts",
      link: "reply_url",
    },
  },

  reactivation: {
    ro: {
      subjects: { a: "Molt doarme, dar te așteaptă", b: "Ce mai face personajul tău?" },
      preheader: "Nu pierde nimic și nu se supără. Se trezește când revii.",
      title: "Molt doarme, dar nu s-a supărat",
      paragraphs: [
        "De ceva vreme nu ne-am mai văzut. Personajul tău doarme: nu pierde nimic și nu se supără, doar așteaptă.",
        "Când revii, se trezește și sare de bucurie. Dacă vrei să reiei ușor, alege un singur obicei pentru azi.",
      ],
      newTitle: "Ce a apărut între timp",
      bullets: [
        "Coach-ul AI îți propune schimbări concrete și măsoară dacă au ajutat. Tu confirmi.",
        "Grupuri cu prietenii, cu clasament și impulsuri.",
        "Planificator și sesiuni Focus, ca bifele să încapă în zi.",
      ],
      note: "Acesta e singurul email de acest fel pe care ți-l trimitem. Dacă nu mai vrei emailuri de la Molted, te poți dezabona oricând mai jos.",
      cta: "Trezește-l pe Molt",
      link: "app_url",
    },
    en: {
      subjects: { a: "Molt is asleep, but waiting for you", b: "How is your character doing?" },
      preheader: "He loses nothing and is not upset. He wakes up when you are back.",
      title: "Molt is asleep, but not upset",
      paragraphs: [
        "It has been a while. Your character is asleep: he loses nothing and is not upset, he just waits.",
        "When you come back, he wakes up and jumps for joy. If you want to ease back in, pick one habit for today.",
      ],
      newTitle: "What is new since you left",
      bullets: [
        "The AI coach proposes concrete changes and measures whether they helped. You confirm.",
        "Groups with friends, with a leaderboard and nudges.",
        "A planner and Focus sessions, so check-ins fit your day.",
      ],
      note: "This is the only email of this kind we will send you. If you no longer want emails from Molted, you can unsubscribe at any time below.",
      cta: "Wake Molt up",
      link: "app_url",
    },
  },
};

export const FOOTER = {
  ro: {
    why: "Primești acest email pentru că ai un cont Molted cu adresa {{email}}.",
    unsubscribe: "Dezabonează-te",
    prefs: "Preferințe email",
    who: "Echipa Molted · {{contact}}",
  },
  en: {
    why: "You are receiving this email because you have a Molted account with the address {{email}}.",
    unsubscribe: "Unsubscribe",
    prefs: "Email preferences",
    who: "The Molted team · {{contact}}",
  },
};
