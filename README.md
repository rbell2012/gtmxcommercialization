# gtmxcommercialization

A new project — connect to GitHub and Supabase using the steps below.

---

## 1. GitHub: Create repo and connect

### Option A: Create repo on GitHub first, then connect locally

1. **Create the repository on GitHub**
   - Go to [github.com/new](https://github.com/new)
   - Repository name: `gtmxcommercialization`
   - Choose **Public** or **Private**
   - Do **not** initialize with a README, .gitignore, or license (this folder already has content)
   - Click **Create repository**

2. **Initialize git and connect (run in this project folder)**
   ```bash
   cd gtmxcommercialization
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/rbell2012/gtmxcommercialization.git
   git push -u origin main
   ```


---

## 2. Supabase: Create project and connect

### Create a Supabase project

1. **Sign in / sign up**
   - Go to [supabase.com](https://supabase.com) and sign in (or create an account).

2. **New project**
   - Click **New project**.
   - **Organization:** use default or create one.
   - **Name:** `gtmxcommercialization` (or any name you prefer).
   - **Database password:** set and store it securely (e.g. password manager).
   - **Region:** choose the closest to your users.
   - Click **Create new project** and wait for the project to be ready.

3. **Get connection details**
   - In the Supabase dashboard, open **Project Settings** (gear icon) → **API**.
   - Note:
     - **Project URL** (e.g. `https://xxxxx.supabase.co`)
     - **anon public** key (safe for frontend)
     - **service_role** key (backend only; keep secret)

### Connect your app to Supabase

- **Frontend (e.g. React, Next.js, Vue):**
  - Install the client: `npm install @supabase/supabase-js`
  - Create a Supabase client using the **Project URL** and **anon** key.
  - Never commit the **service_role** key in frontend code.

- **Environment variables**
  - Copy `.env.example` to `.env.local` in the project root, then fill in your values:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
    ```
  - `.env.local` and `.env` are in `.gitignore` so keys are not pushed to GitHub.
  - For Hex embed (optional): set `HEX_API_TOKEN` and `HEX_PROJECT_ID` in your Supabase Edge Function secrets or in the environment that runs the `hex-embed-url` function.

### Optional: Link Supabase to GitHub (CI/CD)

1. In Supabase dashboard: **Project Settings** → **Integrations** → **GitHub**.
2. Connect your GitHub account and select the `gtmxcommercialization` repo.
3. Configure branch and deploy commands if you use Supabase Edge Functions or database migrations.

---

---

## 3. Run the app

The app is a Vite + React (TypeScript) front end with Tailwind. Data is read from Hex (embed) and written to Supabase.

```bash
cp .env.example .env.local
# Edit .env.local: set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# Optional: set VITE_HEX_EMBED_URL_API to your Supabase Edge Function URL for Hex embed

npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Database

Run the migration in Supabase (SQL Editor or `supabase db push`):

- `supabase/migrations/20250223000000_create_findings.sql` — creates the `findings` table for app writes.

### Hex embed

To show your Hex project in the app:

1. Deploy the Edge Function `hex-embed-url` (see `supabase/functions/hex-embed-url/README.md`). Full code is in that folder and in the README for copy-paste into Supabase.
2. Set Supabase secrets: `HEX_API_TOKEN`, `HEX_PROJECT_ID`.
3. Set `VITE_HEX_EMBED_URL_API` in `.env.local` to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/hex-embed-url`.

---

## Quick reference

| Step              | Action |
|-------------------|--------|
| GitHub repo       | [Create repo](https://github.com/new) → name: `gtmxcommercialization` |
| Local → GitHub    | `git init` → `git add .` → `git commit` → `git remote add origin` → `git push` |
| Supabase project  | [Supabase Dashboard](https://app.supabase.com) → New project |
| App connection    | Use **Project URL** + **anon** key in your app; store in `.env.local` with `VITE_SUPABASE_*` and keep out of git |
