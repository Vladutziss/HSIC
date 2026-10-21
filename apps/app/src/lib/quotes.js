import { tr } from "./i18n.js";
// Quotes shown at key moments. Each is tagged with the moments it fits and,
// optionally, the paths (goals) it speaks to. Sources are cited so a reader
// can look them up; translations are ours.

export const QUOTES = [
  { id: "aurelius-way", text: tr("Piedica din calea acțiunii o împinge înainte. Ce îți stă în drum devine drumul."), author: tr("Marcus Aurelius"), source: tr("Meditații, V.20"), tags: ["reset", "drop", "return"] },
  { id: "aurelius-be", text: tr("Nu mai pierde timpul dezbătând cum ar trebui să fie un om bun. Fii unul."), author: tr("Marcus Aurelius"), source: tr("Meditații, X.16"), tags: ["return", "reset", "hatch"] },
  { id: "aurelius-dyed", text: tr("Așa cum îți sunt gândurile obișnuite, așa îți va fi și mintea: sufletul se colorează de gânduri."), author: tr("Marcus Aurelius"), source: tr("Meditații, V.16"), tags: ["streak", "levelup", "evolve"], paths: ["minte"] },
  { id: "seneca-short", text: tr("Nu avem prea puțin timp, ci risipim mult din el."), author: tr("Seneca"), source: tr("Despre scurtimea vieții, I"), tags: ["drop", "reset"] },
  { id: "seneca-postpone", text: tr("Cât timp amânăm, viața trece pe lângă noi."), author: tr("Seneca"), source: tr("Scrisori către Lucilius, I"), tags: ["drop", "return"] },
  { id: "seneca-poor", text: tr("Nu e sărac cel care are puțin, ci cel care râvnește mai mult."), author: tr("Seneca"), source: tr("Scrisori către Lucilius, II"), tags: ["levelup", "drop"], paths: ["bani"] },
  { id: "seneca-learn", text: tr("Cât timp trăiești, continuă să înveți cum să trăiești."), author: tr("Seneca"), source: tr("Scrisori către Lucilius, LXXVI"), tags: ["levelup", "evolve", "streak"], paths: ["studiu"] },
  { id: "seneca-everywhere", text: tr("Cine e peste tot nu e nicăieri."), author: tr("Seneca"), source: tr("Scrisori către Lucilius, II"), tags: ["drop"], paths: ["studiu", "creativ"] },
  { id: "epictetus-fig", text: tr("Nimic măreț nu se naște dintr-odată, nici măcar un ciorchine de struguri sau o smochină."), author: tr("Epictet"), source: tr("Diatribe, I.15"), tags: ["levelup", "evolve", "hatch"] },
  { id: "epictetus-say", text: tr("Spune-ți mai întâi ce vrei să fii, apoi fă ce ai de făcut."), author: tr("Epictet"), source: tr("Diatribe, III.23"), tags: ["hatch", "return", "levelup"] },
  { id: "epictetus-opinions", text: tr("Pe oameni nu îi tulbură lucrurile, ci părerile lor despre lucruri."), author: tr("Epictet"), source: tr("Manualul, 5"), tags: ["reset", "drop"], paths: ["minte"] },
  { id: "aristotle-acts", text: tr("Devenim drepți săvârșind fapte drepte, cumpătați prin fapte cumpătate, curajoși prin fapte curajoase."), author: tr("Aristotel"), source: tr("Etica nicomahică, II.1"), tags: ["streak", "levelup"] },
  { id: "durant-habit", text: tr("Suntem ceea ce facem în mod repetat. Excelența nu este, așadar, un act, ci un obicei."), author: tr("Will Durant"), source: tr("rezumându-l pe Aristotel în Povestea filozofiei, 1926"), tags: ["streak", "levelup", "evolve"] },
  { id: "laozi-step", text: tr("Călătoria de o mie de li începe sub tălpile tale."), author: tr("Lao Zi"), source: tr("Tao Te Ching, 64"), tags: ["hatch", "return", "reset"] },
  { id: "plato-beginning", text: tr("Începutul este partea cea mai importantă a oricărei lucrări."), author: tr("Platon"), source: tr("Republica, II, 377a"), tags: ["hatch", "return", "reset"] },
  { id: "socrates-examined", text: tr("O viață necercetată nu merită trăită."), author: tr("Socrate"), source: tr("în Apologia lui Platon, 38a"), tags: ["evolve", "levelup"] },
  { id: "newton-giants", text: tr("Dacă am văzut mai departe, este pentru că am stat pe umerii unor giganți."), author: tr("Isaac Newton"), source: tr("scrisoare către Robert Hooke, 1675"), tags: ["levelup", "evolve"], paths: ["studiu"] },
  { id: "einstein-bike", text: tr("Viața e ca mersul pe bicicletă: ca să-ți păstrezi echilibrul, trebuie să mergi mai departe."), author: tr("Albert Einstein"), source: tr("scrisoare către fiul său Eduard, 1930"), tags: ["drop", "reset", "streak", "return"] },
  { id: "davinci-iron", text: tr("Fierul ruginește când nu e folosit, apa stătută își pierde limpezimea; la fel, inactivitatea secătuiește vigoarea minții."), author: tr("Leonardo da Vinci"), source: tr("Caiete"), tags: ["drop", "reset"] },
  { id: "beckett-fail", text: tr("Ai încercat. Ai eșuat. Nu contează. Încearcă din nou. Eșuează din nou. Eșuează mai bine."), author: tr("Samuel Beckett"), source: tr("Worstward Ho, 1983"), tags: ["reset", "return"], paths: ["creativ"] },
  { id: "franklin-time", text: tr("Timpul pierdut nu mai poate fi găsit niciodată."), author: tr("Benjamin Franklin"), source: tr("Almanahul bietului Richard, 1748"), tags: ["drop"] },
  { id: "franklin-leak", text: tr("Ferește-te de cheltuielile mărunte: o spărtură mică scufundă o corabie mare."), author: tr("Benjamin Franklin"), source: tr("Calea spre bogăție, 1758"), tags: ["streak", "drop", "levelup"], paths: ["bani"] },
  { id: "curie-remains", text: tr("Nu observi niciodată ce s-a făcut; vezi doar ce mai rămâne de făcut."), author: tr("Marie Curie"), source: tr("scrisoare către fratele ei, 1894"), tags: ["levelup", "evolve"], paths: ["studiu"] },
  { id: "feynman-fool", text: tr("Primul principiu e să nu te păcălești pe tine însuți, iar tu ești cel mai ușor de păcălit."), author: tr("Richard Feynman"), source: tr("discurs la Caltech, 1974"), tags: ["evolve", "drop"], paths: ["studiu"] },
  { id: "munger-wiser", text: tr("Încearcă să fii în fiecare zi puțin mai înțelept decât erai când te-ai trezit."), author: tr("Charlie Munger"), source: tr("discurs la USC, 2007"), tags: ["streak", "levelup"], paths: ["bani", "studiu"] },
  { id: "jordan-missed", text: tr("Am ratat peste 9.000 de aruncări în carieră. Am pierdut aproape 300 de meciuri… Am eșuat iar și iar în viață. Și de aceea reușesc."), author: tr("Michael Jordan"), source: tr("reclamă Nike, 1997"), tags: ["reset", "return", "drop"], paths: ["sport"] },
  { id: "jfk-fitness", text: tr("Condiția fizică nu este doar una dintre cheile unui corp sănătos; ea stă la baza activității intelectuale dinamice și creatoare."), author: tr("John F. Kennedy"), source: tr("„The Soft American”, Sports Illustrated, 1960"), tags: ["levelup", "streak", "evolve"], paths: ["sport"] },
  { id: "brancusi-state", text: tr("Lucrurile nu sunt greu de făcut; greu este să ne punem în starea de a le face."), author: tr("Constantin Brâncuși"), source: "aforisme", tags: ["return", "drop", "hatch", "reset"], paths: ["creativ"] },
  { id: "nietzsche-why", text: tr("Dacă ai propriul tău „de ce” al vieții, te împaci cu aproape orice „cum”."), author: tr("Friedrich Nietzsche"), source: tr("Amurgul idolilor, Maxime, 12"), tags: ["drop", "reset"] },
  { id: "euclid-royal", text: tr("Nu există drum regal către geometrie."), author: tr("Euclid"), source: tr("după Proclus, Comentariu la Elemente"), tags: ["drop", "levelup", "streak"], paths: ["studiu"] },
  { id: "hesiod-little", text: tr("Dacă adaugi puțin la puțin și faci asta des, în curând și acel puțin va deveni mult."), author: tr("Hesiod"), source: tr("Munci și zile"), tags: ["streak", "levelup", "evolve"], paths: ["bani"] },
  { id: "ovid-drop", text: tr("Picătura scobește piatra."), author: tr("Ovidiu"), source: tr("Scrisori din Pont, IV.10"), tags: ["streak", "levelup"] },
  { id: "confucius-mound", text: tr("E ca la înălțarea unei movile: dacă mă opresc când mai lipsește un singur coș de pământ, oprirea e a mea."), author: tr("Confucius"), source: tr("Analecte, IX"), tags: ["drop", "streak"] },
  { id: "hippocrates-art", text: tr("Arta e lungă, viața e scurtă."), author: tr("Hipocrate"), source: tr("Aforisme, I.1"), tags: ["levelup", "drop"], paths: ["creativ", "studiu"] },
  { id: "ovid-rest", text: tr("Ce nu are o odihnă alternantă nu poate dura."), author: tr("Ovidiu"), source: tr("Arta de a iubi, II.351"), tags: ["break"] },
  { id: "seneca-relax", text: tr("Mintea trebuie lăsată să se destindă: odihnită, se va ridica mai bună și mai ageră."), author: tr("Seneca"), source: tr("Despre liniștea sufletească, XVII.5"), tags: ["break"] },
  { id: "aurelius-retreat", text: tr("Nicăieri nu se retrage omul mai liniștit și mai ferit de griji decât în propriul suflet."), author: tr("Marcus Aurelius"), source: tr("Meditații, IV.3"), tags: ["break"] },
  { id: "aristotle-rest", text: tr("Ne odihnim ca să putem lucra."), author: tr("Aristotel"), source: tr("Etica nicomahică, X.6"), tags: ["break"] },
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
