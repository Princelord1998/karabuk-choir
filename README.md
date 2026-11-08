# Site de la chorale – Chants, messes et programmes

```
frontend/   React + TypeScript (Vite)    the website: Accueil, Programme, Chants, Messes, Connexion
backend/    TypeScript (Node 22)         API, rules, login; talks to Supabase
renderer/   Python (Flask)               fills your Word template and makes the PDF preview
supabase/   schema.sql                   the database
data/       CSV export of your songs     imported once into Supabase (npm run import)
```

## 1. Supabase (once)
1. supabase.com -> New project.
2. SQL Editor -> paste `supabase/schema.sql` -> Run.
3. Authentication -> Users -> Add user: e-mail + password for each choir leader (tick "Auto Confirm User").
   Authentication -> Sign In / Providers -> Email: turn OFF "Allow new users to sign up".
4. Project Settings -> API: copy the Project URL, the `anon` key and the `service_role` key.

## 2. Backend settings
```powershell
cd backend
copy .env.example .env      # then fill it in: SUPABASE_URL, SUPABASE_KEY (service_role), SUPABASE_ANON_KEY, ADMIN_EMAILS
npm install
npm run import              # loads data/*.csv into Supabase (add  -- ../data --wipe  to replace existing data)
npm run dev
```
`SUPABASE_KEY` (service_role) must stay in `backend/.env` only. Never put it in the frontend or in git.

## 3. Renderer and frontend
```powershell
cd renderer; pip install -r requirements.txt; pip install pywin32; python app.py
cd frontend; npm install; npm run dev        # open http://localhost:5173
```

## Who can do what
- Everyone: browse songs (search titles, melodies, lyrics), see all Masses, open and download any program.
- Logged-in editors (`ADMIN_EMAILS`): add / edit / delete songs, build programs, load a complete Mass.

## Tests (no Supabase needed: they run against a built-in stand-in loaded with your CSV data)
```powershell
cd backend; npm test
```

## Architecture (backend)
`domain/` types and ports, imports nothing. `application/` use cases, imports domain only.
`infrastructure/` Supabase, Supabase Auth, Python renderer adapters. `interface/http.ts` routes.
`main.ts` is the only place that chooses adapters.

## Word template
See `renderer/template_markers.docx` (your program with [[START_..]]/[[END_..]] markers) and `renderer/add_markers.py`.
