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
   git remote add origin https://github.com/YOUR_USERNAME/gtmxcommercialization.git
   git push -u origin main
   ```
   Replace `YOUR_USERNAME` with your GitHub username.

### Option B: Use GitHub CLI (if installed)

```bash
cd gtmxcommercialization
git init
git add .
git commit -m "Initial commit"
gh repo create gtmxcommercialization --private --source=. --push
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
  - Create a `.env.local` (or `.env`) in the project root and add:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_project_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
    ```
  - Ensure `.env.local` and `.env` are in `.gitignore` so keys are not pushed to GitHub.

### Optional: Link Supabase to GitHub (CI/CD)

1. In Supabase dashboard: **Project Settings** → **Integrations** → **GitHub**.
2. Connect your GitHub account and select the `gtmxcommercialization` repo.
3. Configure branch and deploy commands if you use Supabase Edge Functions or database migrations.

---

## Quick reference

| Step              | Action |
|-------------------|--------|
| GitHub repo       | [Create repo](https://github.com/new) → name: `gtmxcommercialization` |
| Local → GitHub    | `git init` → `git add .` → `git commit` → `git remote add origin` → `git push` |
| Supabase project  | [Supabase Dashboard](https://app.supabase.com) → New project |
| App connection    | Use **Project URL** + **anon** key in your app; store in `.env` and keep `.env` out of git |
