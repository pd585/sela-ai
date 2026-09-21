# SELA — Supabase & Google Cloud Setup Guide

This guide details how to configure a brand-new Supabase project and Google Cloud Console for running **SELA** independently.

---

## 1. Database Schema & Migration Execution

1. Create a new Supabase project at [https://database.new](https://database.new).
2. Go to **SQL Editor** in your Supabase dashboard.
3. Execute the SQL script found in `drizzle/migrations/0000_sela_core_schema.sql`.

This script:

- Enables the `vector` extension (`pgvector`).
- Creates the `documents`, `document_chunks`, and `document_questions` tables.
- Enables Row Level Security (RLS) policies on all tables so user data remains isolated (`auth.uid() = user_id`).
- Creates the `match_document_chunks` RPC similarity search function.

---

## 2. Storage Bucket Configuration

1. In your Supabase Dashboard, navigate to **Storage**.
2. Click **New Bucket** and create a bucket named: `documents`.
3. Keep the bucket **Private** (Public: `OFF`).
4. Go to **SQL Editor** and run `drizzle/migrations/0001_documents_storage_policies.sql` to apply the RLS policies for storage objects:
   - Users can read, upload, and delete only their own document files (`folder = auth.uid()`).

---

## 3. Google OAuth & Supabase Auth Setup

To enable Google Sign-In with PKCE:

### Step A: Google Cloud Console Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then navigate to **APIs & Services** > **Credentials**.
3. Click **Create Credentials** > **OAuth client ID**.
4. Set Application Type to **Web application**.
5. Under **Authorized redirect URIs**, add your Supabase Auth callback URL:
   `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
6. Click **Create** and save your **Client ID** and **Client Secret**.

### Step B: Supabase Dashboard Configuration

1. Open your Supabase Dashboard and go to **Authentication** > **Providers** > **Google**.
2. Enable the Google provider.
3. Paste the **Client ID** and **Client Secret** obtained from Google Cloud Console.
4. Under **Authentication** > **URL Configuration**, set:
   - **Site URL**: `http://localhost:3000` (or your production URL).
   - **Redirect URLs**: Add `http://localhost:3000/auth/callback` (and your production URL `/auth/callback`).

---

## 4. Environment Variables Configuration

In your `.env` file, populate the following values:

```env
SUPABASE_URL=https://<YOUR_PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<YOUR_SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SUPABASE_SERVICE_ROLE_KEY>

VITE_SUPABASE_URL=https://<YOUR_PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<YOUR_SUPABASE_ANON_KEY>

GEMINI_API_KEY=<YOUR_GOOGLE_GEMINI_API_KEY>
OPENROUTER_API_KEY=<OPTIONAL_OPENROUTER_KEY>
```
