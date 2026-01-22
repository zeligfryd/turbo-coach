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
- Supabase account and project

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

You can find these values in your [Supabase project settings](https://app.supabase.com/project/_/settings/api).

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
