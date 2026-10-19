# BlupShare 🫧

Partajare de locație în timp real pentru grupuri de prieteni ("cercuri"), pornind din Timișoara. Web app (PWA) acum, aplicație Android mai târziu (Capacitor).

**Live:** https://corneluu.github.io/blupshare/

## Stack
Vite + React 19 + TypeScript · Tailwind v4 · Supabase (Auth, Postgres, Realtime, RLS) · MapLibre GL + OpenFreeMap · lucide-react

## Rulare locală
```bash
npm install
cp .env.example .env   # completează URL-ul și publishable key din Supabase
npm run dev
```

## Deploy
Push pe `main` → GitHub Actions construiește și publică pe GitHub Pages. Setează în repo → Settings → Secrets → Actions: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Settings → Pages → Source: **GitHub Actions**.

## Confidențialitate
Locația e vizibilă doar membrilor cercurilor tale, doar cât partajarea e pornită. Nu folosim locația pentru reclame. Cheile secrete (`sb_secret_...`, `service_role`) nu intră niciodată în acest repo.
