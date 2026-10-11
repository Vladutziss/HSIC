// Quotes shown at key moments. Each is tagged with the moments it fits and,
// optionally, the paths (goals) it speaks to. Sources are cited so a reader
// can look them up; translations are ours.

export const QUOTES = [
  { id: "aurelius-way", text: "Piedica din calea acțiunii o împinge înainte. Ce îți stă în drum devine drumul.", author: "Marcus Aurelius", source: "Meditații, V.20", tags: ["reset", "drop", "return"] },
  { id: "aurelius-be", text: "Nu mai pierde timpul dezbătând cum ar trebui să fie un om bun. Fii unul.", author: "Marcus Aurelius", source: "Meditații, X.16", tags: ["return", "reset", "hatch"] },
  { id: "aurelius-dyed", text: "Așa cum îți sunt gândurile obișnuite, așa îți va fi și mintea: sufletul se colorează de gânduri.", author: "Marcus Aurelius", source: "Meditații, V.16", tags: ["streak", "levelup", "evolve"], paths: ["minte"] },
  { id: "seneca-short", text: "Nu avem prea puțin timp, ci risipim mult din el.", author: "Seneca", source: "Despre scurtimea vieții, I", tags: ["drop", "reset"] },
  { id: "seneca-postpone", text: "Cât timp amânăm, viața trece pe lângă noi.", author: "Seneca", source: "Scrisori către Lucilius, I", tags: ["drop", "return"] },
  { id: "seneca-poor", text: "Nu e sărac cel care are puțin, ci cel care râvnește mai mult.", author: "Seneca", source: "Scrisori către Lucilius, II", tags: ["levelup", "drop"], paths: ["bani"] },
  { id: "seneca-learn", text: "Cât timp trăiești, continuă să înveți cum să trăiești.", author: "Seneca", source: "Scrisori către Lucilius, LXXVI", tags: ["levelup", "evolve", "streak"], paths: ["studiu"] },
  { id: "seneca-everywhere", text: "Cine e peste tot nu e nicăieri.", author: "Seneca", source: "Scrisori către Lucilius, II", tags: ["drop"], paths: ["studiu", "creativ"] },
  { id: "epictetus-fig", text: "Nimic măreț nu se naște dintr-odată, nici măcar un ciorchine de struguri sau o smochină.", author: "Epictet", source: "Diatribe, I.15", tags: ["levelup", "evolve", "hatch"] },
  { id: "epictetus-say", text: "Spune-ți mai întâi ce vrei să fii, apoi fă ce ai de făcut.", author: "Epictet", source: "Diatribe, III.23", tags: ["hatch", "return", "levelup"] },
  { id: "epictetus-opinions", text: "Pe oameni nu îi tulbură lucrurile, ci părerile lor despre lucruri.", author: "Epictet", source: "Manualul, 5", tags: ["reset", "drop"], paths: ["minte"] },
  { id: "aristotle-acts", text: "Devenim drepți săvârșind fapte drepte, cumpătați prin fapte cumpătate, curajoși prin fapte curajoase.", author: "Aristotel", source: "Etica nicomahică, II.1", tags: ["streak", "levelup"] },
  { id: "durant-habit", text: "Suntem ceea ce facem în mod repetat. Excelența nu este, așadar, un act, ci un obicei.", author: "Will Durant", source: "rezumându-l pe Aristotel în Povestea filozofiei, 1926", tags: ["streak", "levelup", "evolve"] },
  { id: "laozi-step", text: "Călătoria de o mie de li începe sub tălpile tale.", author: "Lao Zi", source: "Tao Te Ching, 64", tags: ["hatch", "return", "reset"] },
  { id: "plato-beginning", text: "Începutul este partea cea mai importantă a oricărei lucrări.", author: "Platon", source: "Republica, II, 377a", tags: ["hatch", "return", "reset"] },
  { id: "socrates-examined", text: "O viață necercetată nu merită trăită.", author: "Socrate", source: "în Apologia lui Platon, 38a", tags: ["evolve", "levelup"] },
  { id: "newton-giants", text: "Dacă am văzut mai departe, este pentru că am stat pe umerii unor giganți.", author: "Isaac Newton", source: "scrisoare către Robert Hooke, 1675", tags: ["levelup", "evolve"], paths: ["studiu"] },
  { id: "einstein-bike", text: "Viața e ca mersul pe bicicletă: ca să-ți păstrezi echilibrul, trebuie să mergi mai departe.", author: "Albert Einstein", source: "scrisoare către fiul său Eduard, 1930", tags: ["drop", "reset", "streak", "return"] },
  { id: "davinci-iron", text: "Fierul ruginește când nu e folosit, apa stătută își pierde limpezimea; la fel, inactivitatea secătuiește vigoarea minții.", author: "Leonardo da Vinci", source: "Caiete", tags: ["drop", "reset"] },
  { id: "beckett-fail", text: "Ai încercat. Ai eșuat. Nu contează. Încearcă din nou. Eșuează din nou. Eșuează mai bine.", author: "Samuel Beckett", source: "Worstward Ho, 1983", tags: ["reset", "return"], paths: ["creativ"] },
  { id: "franklin-time", text: "Timpul pierdut nu mai poate fi găsit niciodată.", author: "Benjamin Franklin", source: "Almanahul bietului Richard, 1748", tags: ["drop"] },
  { id: "franklin-leak", text: "Ferește-te de cheltuielile mărunte: o spărtură mică scufundă o corabie mare.", author: "Benjamin Franklin", source: "Calea spre bogăție, 1758", tags: ["streak", "drop", "levelup"], paths: ["bani"] },
  { id: "curie-remains", text: "Nu observi niciodată ce s-a făcut; vezi doar ce mai rămâne de făcut.", author: "Marie Curie", source: "scrisoare către fratele ei, 1894", tags: ["levelup", "evolve"], paths: ["studiu"] },
  { id: "feynman-fool", text: "Primul principiu e să nu te păcălești pe tine însuți, iar tu ești cel mai ușor de păcălit.", author: "Richard Feynman", source: "discurs la Caltech, 1974", tags: ["evolve", "drop"], paths: ["studiu"] },
  { id: "munger-wiser", text: "Încearcă să fii în fiecare zi puțin mai înțelept decât erai când te-ai trezit.", author: "Charlie Munger", source: "discurs la USC, 2007", tags: ["streak", "levelup"], paths: ["bani", "studiu"] },
  { id: "jordan-missed", text: "Am ratat peste 9.000 de aruncări în carieră. Am pierdut aproape 300 de meciuri… Am eșuat iar și iar în viață. Și de aceea reușesc.", author: "Michael Jordan", source: "reclamă Nike, 1997", tags: ["reset", "return", "drop"], paths: ["sport"] },
  { id: "jfk-fitness", text: "Condiția fizică nu este doar una dintre cheile unui corp sănătos; ea stă la baza activității intelectuale dinamice și creatoare.", author: "John F. Kennedy", source: "„The Soft American”, Sports Illustrated, 1960", tags: ["levelup", "streak", "evolve"], paths: ["sport"] },
  { id: "brancusi-state", text: "Lucrurile nu sunt greu de făcut; greu este să ne punem în starea de a le face.", author: "Constantin Brâncuși", source: "aforisme", tags: ["return", "drop", "hatch", "reset"], paths: ["creativ"] },
  { id: "nietzsche-why", text: "Dacă ai propriul tău „de ce” al vieții, te împaci cu aproape orice „cum”.", author: "Friedrich Nietzsche", source: "Amurgul idolilor, Maxime, 12", tags: ["drop", "reset"] },
  { id: "euclid-royal", text: "Nu există drum regal către geometrie.", author: "Euclid", source: "după Proclus, Comentariu la Elemente", tags: ["drop", "levelup", "streak"], paths: ["studiu"] },
  { id: "hesiod-little", text: "Dacă adaugi puțin la puțin și faci asta des, în curând și acel puțin va deveni mult.", author: "Hesiod", source: "Munci și zile", tags: ["streak", "levelup", "evolve"], paths: ["bani"] },
  { id: "ovid-drop", text: "Picătura scobește piatra.", author: "Ovidiu", source: "Scrisori din Pont, IV.10", tags: ["streak", "levelup"] },
  { id: "confucius-mound", text: "E ca la înălțarea unei movile: dacă mă opresc când mai lipsește un singur coș de pământ, oprirea e a mea.", author: "Confucius", source: "Analecte, IX", tags: ["drop", "streak"] },
  { id: "hippocrates-art", text: "Arta e lungă, viața e scurtă.", author: "Hipocrate", source: "Aforisme, I.1", tags: ["levelup", "drop"], paths: ["creativ", "studiu"] },
];

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
};

/** Picks a quote for a moment, preferring the player's path and avoiding recent ones. */
export function pickQuote(event, path, recentIds = [], seed = "") {
  const pool = QUOTES.filter((q) => q.tags.includes(event));
  const fresh = pool.filter((q) => !recentIds.includes(q.id));
  const list = fresh.length ? fresh : pool;
  const own = list.filter((q) => q.paths?.includes(path));
  const general = list.filter((q) => !q.paths);
  const h = hash(`${event}|${seed}`);
  const from = own.length && h % 3 !== 0 ? own : general.length ? general : list;
  return from[h % from.length] || QUOTES[0];
}

export const quoteById = (id) => QUOTES.find((q) => q.id === id) || null;
