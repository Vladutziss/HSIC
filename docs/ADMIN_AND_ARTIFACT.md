# Admin și versiunea din claude.ai

Mutate din README.md. Cuprins: panoul de administrare al site-ului și modul în care funcționează pagina publicată în claude.ai.

## Admin (molted.eu/admin.html)

- Login cu Clerk (aceleași conturi ca în aplicație), apoi nume, rol, Instagram, descriere, poză și ordine pentru fiecare membru din echipă, plus o galerie de poze.
- Datele stau în Supabase: tabelele `team_members`, `team_photos` și bucket-ul public `team`. Oricine le poate citi cu cheia anon, ca site-ul să le poată afișa.
- Doar emailurile din `public.site_admins` pot scrie (RLS, `supabase/migrations/0012_team.sql`). Adaugi un admin din SQL editor: `insert into public.site_admins (email) values ('nume@exemplu.com');`
- Proiectul Vercel al landing-ului are nevoie de `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` și `VITE_CLERK_PUBLISHABLE_KEY` (aceleași valori ca la aplicație).
- Giveaway-urile se administrează separat, din `/admin/giveaways/` (vezi `docs/GIVEAWAYS.md`).

## Cum funcționează în claude.ai

Versiunea publicată (`npm run build:artifact`, fără Supabase) folosește capabilitățile paginilor Claude:

- **db**: datele fiecărei persoane stau privat în `data/users/<id>/state` (obiceiuri, istoric, setări) și `data/users/<id>/m-AAAA-LL` (capitole din poveste, texte de raport). Grupurile sunt documente comune: `groups/<id>`, `groups/<id>/members/<uid>` (doar statistici publice) și `groups/<id>/nudges/<id>`.
- **sample**: AI-ul (Claude) rulează pe contul celui care folosește pagina, după ce își dă acordul. Folosește modelul rapid pentru rapoarte și povești.
- **user**: numele membrilor din grup.

Ca să folosească grupurile, prietenii trebuie să poată deschide și edita aplicația (partajare din meniul Share).

Funcțiile care cer AI din server (agentul, căutarea în baza de cunoștințe, rularea săptămânală) nu există în această versiune.

**Datele din prima versiune** (`data/users/<id>/momentum`) nu se șterg. La primul onboarding în versiunea nouă, obiectivul și obiceiurile vechi sunt precompletate, iar to-do-urile se importă (opțiune activă implicit). Istoricul vechi de bife nu se mută, fiindcă era în mare parte date demonstrative.

Pagina generată e `artifact/momentum.html`; se commit-uiește după fiecare rebuild.
