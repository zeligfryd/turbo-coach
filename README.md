# Turbo Coach

A Next.js application with Supabase authentication, built with TypeScript and Tailwind CSS.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Theme**: Dark/Light mode support

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project (for production)
- **Docker Desktop** (for local development) - Follow the [official docs to install](https://docs.docker.com/desktop)

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the root directory.

**For Local Development:**

After running `supabase start` (see [Local Database Development](#local-database-development) section below), copy the `anon key` from the output:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase start output>
```

**For Production:**

Replace with your production Supabase credentials (found in your [Supabase project settings](https://app.supabase.com/project/_/settings/api)):

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

### Local Database Development

To test database migrations and develop locally without affecting your production database:

1. **Install Supabase CLI** (if not already installed):

```bash
npm install -g supabase
```

2. **Start local Supabase** (requires Docker Desktop to be running):

```bash
supabase start
```

This will start a local Supabase instance with PostgreSQL, Auth, and other services. The first run will take a few minutes to download Docker images.

3. **Apply migrations** to your local database:

Migrations in `supabase/migrations/` are automatically applied when you run `supabase start`. To reset and reapply all migrations:

```bash
supabase db reset
```

4. **Test user credentials:**

A test user is automatically seeded for local development:
- **Email:** `test@example.com`
- **Password:** `password123`

Use these credentials to log in without creating a new account each time you reset your local database.

5. **Access local services:**
   - API: `http://localhost:54321`
   - Studio (Database UI): `http://localhost:54323`
   - Inbucket (Email testing): `http://localhost:54324`

6. **Stop local Supabase** when done:

```bash
supabase stop
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
app/
  ├── auth/          # Authentication pages (login, sign-up, etc.)
  ├── protected/     # Protected routes
  └── page.tsx       # Home page
components/          # React components
lib/
  └── supabase/     # Supabase client configuration
```

## Features

- ✅ User authentication (sign up, login, password reset)
- ✅ Protected routes
- ✅ Dark/Light theme switching
- ✅ Server-side rendering with Supabase
- ✅ Responsive design
