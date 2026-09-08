# ViKom Web Portal (React Frontend)

The React + TypeScript + Vite frontend of the ViKom web portal, used by healthcare personnel.

For the full picture (architecture, backend API, setup of all three apps, and current feature status) read **`../HANDOFF.md`**. Before building any UI, read **`src/design-system.md`** (design tokens, component library, conventions).

## Technology Stack

- **React 19** + **TypeScript** (functional components only)
- **Vite** - dev server (port 5173) and build tool
- **React Router 7** - client-side routing
- **Bootstrap 5 + Bootstrap Icons + React-Bootstrap** - all UI and icons
- **@supabase/supabase-js** - realtime signaling for the "Ring pasient" call feature only

## Project Structure (feature folders)

```
src/
├── App.tsx                # All routes + guards
├── main.tsx               # Entry: imports Bootstrap CSS + icons
├── index.css              # Global styles + design tokens (CSS custom properties)
├── design-system.md       # Design system docs - read before building UI
│
├── auth/                  # AuthService.ts, LoginPage, RegisterPage,
│   └── guards/            # PersonnelOnlyRoute.tsx, PublicOnlyRoute.tsx
├── appointments/          # pages/, components/, services/, types/
├── availability/          # Calendar page + slot/window forms and views
├── dashboard/             # DashboardPage → PersonnelDashboard
├── patients/              # Roster, clinical profile pages + cards
├── visits/                # VisitExecutionPage (Besøk), VisitArchivePage,
│                          # PlanningOverviewPage (pages sit flat here)
├── components/common/     # 16 reusable components (CallModal, DataTable,
│                          # PageHeader, SectionCard, StatTile, Tabs, ...)
├── services/              # SupabaseSignalingService.ts (call signaling)
├── layouts/               # Layout, NavBar, Sidebar
├── home/                  # Public landing page
├── config/config.ts       # API_URL (hardcoded http://localhost:5084)
├── types/                 # Auth DTOs (domain types live per-feature)
└── utils/                 # dateUtils.ts
```

## Getting Started

Prerequisites: Node.js 22+, and the backend running at `http://localhost:5084` (see the repo root README).

```bash
npm install
cp .env.example .env.local   # optional: Supabase values, only needed for "Ring pasient"
npm run dev                  # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build to `dist/`), `npm run lint`, `npm run preview`. There is no test script yet; frontend tests are still to be added.

## Configuration

- Backend URL: hardcoded in `src/config/config.ts` (`API_URL = 'http://localhost:5084'`). Change the file if your backend runs elsewhere.
- Supabase (calls only): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Without them the portal works, but the call button reports Supabase as not configured.

## Conventions

- **Service layer:** every feature has its own service module (`AppointmentService.ts`, `VisitService.ts`, …) that wraps `fetch` and attaches the JWT via `AuthService.getAuthHeader()`. Components never call `fetch` directly.
- **Auth:** login stores the backend-issued JWT in `localStorage` (`jwt`) plus a `userInfo` object; `PersonnelOnlyRoute` guards every non-public route (the portal is personnel-only).
- **Styling:** one co-located plain CSS file per page/component (no CSS modules); design tokens from `index.css`; Bootstrap Icons (`bi-*`) for all icons.
- **Reuse first:** check `components/common/` and the design system before writing a new component.

## Routes

- Public: `/`, `/login`, `/register`
- Personnel-only: `/dashboard`, `/appointments`, `/appointments/archive`, `/availability`, `/patients`, `/patients/:username`, `/besok/:appointmentId` (the visit workspace; `?type=Digital` starts a digital visit), `/planning`

## Troubleshooting

- **CORS errors:** in Development the backend accepts any loopback origin, so a different Vite port is fine. Just make sure the backend is running on 5084.
- **401 responses:** the JWT (24h expiry) may have expired; there is no automatic redirect yet, so log out and back in.
- **Call button errors:** either `.env.local` is missing, or the patient has no `supabaseProfileId` (not linked to a TV account).
