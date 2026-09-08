# ViKom Web — Design System

The canonical reference for how the web admin portal is styled. When building or
changing UI, **check here first**: reach for an existing token or component before
writing new CSS, and prefer Bootstrap utilities over bespoke styles.

Stack: React + TypeScript + Vite · Bootstrap 5.3 · react-bootstrap · bootstrap-icons.

> Status: this doc is maintained incrementally alongside the design-system
> refactor (see `~/.claude/plans/please-do-a-thorough-cozy-robin.md`).
> **Increment 1 (done):** design tokens, tamed globals, shared error alert.
> **Increment 2 (done):** `PageHeader` + `Tabs` components; `AppointmentCard`
> extended with subject/actions/footer slots; **Appointments** refactored onto
> the shared components (its custom CSS is now just page padding).
> **Increment 3 (done):** **Dashboards** — `PatientDashboard` fully on
> PageHeader/SectionCard/AppointmentCard/EmptyState; `PersonnelDashboard` on
> PageHeader + AppointmentCard (recent) + EmptyState. PersonnelDashboard's
> bespoke widgets (calendar, today's timeline, availability planner) and its
> stats grid stay custom by design — they aren't duplicated elsewhere.
> **Increment 4 (done):** **Visits** (PlanningOverview, PreferredTime,
> TaskSelection, VisitExecution) on PageHeader + SectionCard + EmptyState +
> StatusBadge; fixed unscoped global CSS leaks (`.empty-state`, `.success-*`,
> `.submit-*`, `.task-description`) by scoping every rule to its page root and
> tokenizing. The submission "success card" markup is still duplicated across
> TaskSelection/PreferredTime (scoped per page) — candidate for a shared
> component later.
> **Increment 5 (done):** **Availability** (AvailabilityCalendarPage + DailyView)
> on PageHeader + EmptyState; scoped all previously-global day-card / table /
> preview / status-badge selectors to the page root and tokenized them; deleted
> 8 orphan (never-imported) component CSS files.
> **Increment 6 (done):** **Auth/Home** — moved global form/alert theming out of
> `css/Forms.css` into `index.css` (tokenized); rewrote Forms.css as auth-scoped
> only and removed its biggest leaks: a global `.btn` override (with
> `border:none`) that competed with index.css, a leaky `.mb-0 a` rule, and two
> broken vars (`var(--dark)`, `var(--primary)`). HomePage CSS scoped to `.hero`
> and tokenized. Deleted 7 more orphan CSS files (Login/Register/Dashboard page
> CSS, the 3 appointment modal CSS files, and the Vite-demo `App.css`).
> **All feature areas + the global stylesheet are now refactored.**
>
> **Increment 7 (done):** button-sizing standard + personnel density. The base
> `.btn` now matches the Patient Details button (the app-wide standard);
> `.btn-sm` / `.btn-lg` are re-asserted in `index.css` so `size="sm"`/`"lg"`
> work again (compact row actions finally shrink). Personnel base font dropped
> to **14px** (`body.role-personnel`); personnel appointment row actions
> (Start/Fullfør) marked `btn-sm`.
> **Increment 8 (done):** typography coherence. Headings now sized from the type
> tokens (`h1–h6` in `index.css`) instead of Bootstrap's oversized defaults;
> `PageHeader` titles/subtitles sized from the tokens (32/16);
> swept all ad-hoc raw-rem **text** sizes onto `--fs-*` tokens (PersonnelDashboard
> ~30 values, PatientProfileHeader, StatTile, Timeline, DataTable, Tabs, Sidebar,
> TaskBadges). Icons, buttons, Avatar, and the Home hero left as-is.
> **Increment 9 (done):** badge + button standardization. **One button** app-wide
> (size tiers collapsed: `.btn-sm`/`.btn-lg` render at the base size); a bordered
> button is the **IconButton look** — transparent + a single `--bs-dark` border +
> dark text (all `btn-outline-*` collapse to it) — so colour only ever comes from
> a solid variant's background. **One badge** via a new shared `Badge` component
> (`bg` + `bordered` only); `StatusBadge` and `TaskBadges` now wrap it, the
> header `InfoChip` was merged into it (deleted), and every ad-hoc `<Badge>` /
> bespoke badge class (TV `vk-tv-status-connected`, `task-type-badge`,
> `area-badge`, `status-badge`, `vk-status-planned`) was migrated/removed.

---

## 1. Core principles

1. **Tokens over literals.** Never hardcode a hex colour, spacing value, font
   size, radius, or shadow. Tokens already cover this and they live in
   [`:root` in index.css](./index.css).
2. **Bootstrap-first.** Use Bootstrap utilities (`d-flex`, `gap-3`, `p-4`,
   `mb-3`, `row`/`col`) and components (`Alert`, `Badge`, `Button`, `Card`,
   `Modal`) before writing custom CSS. Only write custom CSS for genuinely
   ViKom-specific visuals.
3. **Reuse shared components.** The `components/common/` library already covers
   most patterns (tables, cards, badges, empty states, etc.). Use them instead
   of re-implementing markup per page.
4. **No `!important`.** If you need it, the real fix is usually to not apply a
   conflicting Bootstrap `bg-*`/utility (those are `!important`) and let a custom
   class own the style — see `StatusBadge` for the pattern.
5. **No new bare-element selectors.** Global element styling (`body`, `h1–h6`)
   is intentional and centralised in `index.css`. Don't add more. Scope custom
   rules to a component/page class, and use the `vk-` prefix for reusable ones.

---

## 2. Design tokens

All tokens are CSS custom properties defined in [`index.css`](./index.css) `:root`.

### Colour — brand & semantic

| Token                       | Value              | Use                            |
| --------------------------- | ------------------ | ------------------------------ |
| `--bs-primary`              | `#7c56e3`          | Primary actions, active states |
| `--bs-primary-hover`        | `#6b47c9`          | Primary hover                  |
| `--bs-secondary`            | `#1e214c`          | Headings, dark emphasis        |
| `--bs-info`                 | `#1932b2`          | Informational                  |
| `--bs-success`              | `#28a745`          | Completed / available          |
| `--bs-danger`               | `#dc3545`          | Errors / cancelled             |
| `--bs-dark`                 | `#111215`          | Text, strong borders           |
| `--bs-light` / `--bs-white` | `#f8f9fa` / `#fff` | Surfaces                       |

`*-rgb` variants exist for use in `rgba(...)` (e.g. `--bs-primary-rgb`).

### Colour — neutral / gray scale

`--gray-100` `#f8f9fa` · `--gray-200` `#e9ecef` · `--gray-300` `#dee2e6` ·
`--gray-400` `#ced4da` · `--gray-500` `#adb5bd` · `--gray-600` `#6c757d` ·
`--gray-700` `#495057` · `--gray-800` `#343a40` · `--gray-900` `#111215`

Semantic aliases: `--border-color` (gray-300), `--border-strong` (dark),
`--text-muted` (gray-600), `--surface-muted` (gray-100).

### Colour — status surfaces (alerts)

`--danger-surface-bg/-fg/-border` and `--success-surface-bg/-fg/-border`.
Used by `.vk-error-alert` and Bootstrap `.alert-*` overrides — don't hardcode
alert colours.

### Spacing scale

`--space-1` 0.25 · `--space-2` 0.5 · `--space-3` 0.75 · `--space-4` 1 ·
`--space-5` 1.5 · `--space-6` 2 · `--space-7` 3 (rem). Bootstrap-aligned.
**Prefer Bootstrap padding/margin/gap utilities in JSX**; use the tokens inside
custom CSS.

### Font-size scale

`--fs-xs` 0.75 · `--fs-sm` 0.875 · `--fs-base` 1 · `--fs-md` 1.125 ·
`--fs-lg` 1.25 · `--fs-xl` 1.5 · `--fs-2xl` 2 · `--fs-hero` 4 (rem).

### Radius

`--radius-sm` 0.75 · `--radius-default` 1 · `--radius-card` 1.25 (rem) ·
`--radius-pill` 999px.

### Elevation / shadow

`--shadow-sm` · `--shadow-md` · `--shadow-lg` · `--focus-ring` (single primary
focus ring — use everywhere instead of ad-hoc focus shadows).

---

## 3. Typography

- **Body:** Poppins (`--font-primary`). **Headings:** Nunito (`--font-heading`).
- **Base size:** 14px (`--fs-sm`) on `body`. The portal is personnel-only;
  patients use the TV app, which sets its own larger scale for elderly users.
  Form controls (`.form-control`/`.form-select`) don't inherit the body size, so
  `index.css` sizes them explicitly.
- **Buttons:** there is **one button size** app-wide (matches `IconButton` / the
  "Ring pasient" button). `size="sm"`/`"lg"` are intentionally collapsed to the
  base size in `index.css`, so don't rely on them for density. A button is either
  **solid** (colour from a `variant` background) or **bordered** (`outline-*` →
  transparent + one `--bs-dark` border + dark text, the IconButton look). Only the
  background colour and border presence vary.
- **Heading scale** (`index.css`, sized from the type tokens — not Bootstrap's
  defaults): `h1 → --fs-2xl (32) · h2 → --fs-xl (24) · h3 → --fs-lg (20) ·
  h4 → --fs-md (18) · h5 → --fs-base (16) · h6 → --fs-sm (14)`. Don't restyle bare
  headings per page; if a specific size is needed, override with a token.
- **Page titles** use the `PageHeader` component, which is **role-aware**
  (`PageHeader.css`): personnel title `--fs-xl` (24) / subtitle `--fs-base` (16);
  patient title `--fs-2xl` (32) / subtitle `--fs-md` (18). Titles stay
  proportional to each side's body text.
- **No raw-rem font-sizes for text.** Every text size must come from a `--fs-*`
  token. (Icon glyph sizes, the marketing hero, and button text are the only
  exceptions.)

---

## 4. Component library (`src/components/common/`)

Use these instead of hand-rolling markup. "Use instead of" notes the manual
pattern each one replaces.

| Component                                | Purpose                                                          | Key props                                                                    | Use instead of                                      |
| ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| `DataTable<T>`                           | Config-driven table card                                         | `columns`, `data`, `rowKey`, `onRowClick`, `emptyText`, `emptyIcon`, `hover` | Hand-built `<table>` / Bootstrap `Table` per page   |
| `SectionCard`                            | Standard card (bordered, light header w/ icon + optional action) | `title`, `icon`, `action`, `bodyClassName`                                   | `.card`/`.appointments-card` + manual header markup |
| `EmptyState`                             | Centered empty placeholder                                       | `icon`, `text`, `action`                                                     | `text-center py-4` empty blocks / custom `.empty-*` |
| `Badge`                                  | **The** badge — fixed size/shape; only `bg` + border vary        | `bg` (BadgeColor), `bordered`, `icon`                                        | react-bootstrap `<Badge>`, `InfoChip`, bespoke badge CSS |
| `StatusBadge`                            | Status → coloured `Badge` + Norwegian label                      | `status`                                                                     | Inline `<Badge>` with manual variant/label mapping  |
| `TaskBadges`                             | Comma-separated tasks → `Badge`s                                 | `tasks`, `variant`                                                           | Splitting + mapping badges inline                   |
| `InfoRow`                                | Label/value row (icon, empty fallback)                           | `label`, `value`, `icon`, `emptyText`                                        | `ListGroup.Item d-flex justify-content-between`     |
| `StatTile`                               | Compact KPI tile (icon + value + label)                          | `label`, `value`, `icon`                                                     | Custom stat-card markup                             |
| `IconButton`                             | Square outlined icon-only button                                 | `icon`, `onClick`, `title`, `loading`, `disabled`                            | Bare `<button>` with an icon                        |
| `Avatar`                                 | Initials/photo circle                                            | `name`, `size` (sm/md/lg), `imageUrl`                                        | Manual avatar divs                                  |
| `Timeline`                               | Vertical activity feed                                           | `items`, `emptyText`, `emptyIcon`                                            | Custom activity lists                               |
| `Tabs`                                   | Pill tab bar w/ count badges                                     | `tabs` (`{key,label,icon?,count?}[]`), `activeKey`, `onChange`               | Page-specific `.tab-navigation` markup              |
| `PageHeader`                             | Page title + subtitle + right-aligned actions                    | `title`, `subtitle`, `actions`                                               | Inline `<h1>` + subtitle + action-row per page      |
| `AppointmentCard`                        | Appointment card (date/time, subject, status, tasks, actions)    | `appointment`, `taskVariant`, `dateTimeText`, `subject`, `footerNote`, `actions` | Inline appointment-item markup                  |

**Still underused (target for upcoming refactors):** the shared components are
wired into the patient feature, the Appointments page, and both dashboards. The
**visits** and **availability** pages still re-implement cards, empty states and
toolbars by hand — prefer the shared versions in new work.

### Shared CSS utilities (global, in `index.css`)

- `.vk-error-alert` + `.vk-error-alert__close` — dismissible page-level error
  banner. Single source; don't redefine per page.

---

## 5. Layout standards

- **Page padding:** content area uses a consistent page padding (`2rem`); keep it
  via the layout container, not per-page overrides.
- **Page header:** every page should open with `<PageHeader>` (title + optional
  subtitle + right-aligned `actions`). Put page-level buttons (create, clean up)
  in its `actions` slot, then render `<Tabs>` / content below.
- **Detail layouts:** two-column (Bootstrap `Col lg={4}` / `lg={8}`); stack cards
  in a column with `.vk-card-stack`.
- **Grids:** use Bootstrap `row`/`col` for stat grids and card grids rather than
  bespoke CSS grid where Bootstrap suffices.

---

## 6. Bootstrap conventions

- **Do** use utilities for layout/spacing/flex/typography sizing.
- **Do** use react-bootstrap `Alert`, `Button`, `Card`, `Modal`, `Nav`.
- **Badges:** use the shared **`Badge`** component (never react-bootstrap `<Badge>`
  or a bespoke badge class). The only knobs are `bg` (a `BadgeColor`) and
  `bordered`; font-size/padding/radius/border-colour are fixed. Badges are
  smaller than buttons (they live inside modules).
- **Buttons:** one size everywhere; colour via a solid `variant`, or `outline-*`
  for the single dark-bordered style. Don't reintroduce `btn-sm`/`btn-lg` density
  or semantic-coloured outlines.
- **Don't** override Bootstrap component classes globally beyond the intentional
  theming already in `index.css` (`.btn`, `.card`, `.badge`).
- **Don't** fight a Bootstrap `bg-*`/utility with `!important`; omit the
  conflicting utility and let a custom class style it (see `StatusBadge`).

---

## 7. Do / Don't

| ✅ Do                                               | ❌ Don't                                           |
| --------------------------------------------------- | -------------------------------------------------- |
| Use a token (`var(--space-4)`, `var(--gray-600)`)   | Hardcode `1rem`, `#6c757d`                         |
| Reuse a `components/common/` component              | Re-implement tables/cards/empty states inline      |
| Prefix reusable classes `vk-`                       | Add bare global selectors (`.card-item`, `button`) |
| Scope page CSS under a page/component class         | Leak styles to global element selectors            |
| Use Bootstrap utilities for spacing/flex            | Write custom flex/margin CSS that Bootstrap covers |
| Omit conflicting `bg-*` then style via custom class | Reach for `!important`                             |
