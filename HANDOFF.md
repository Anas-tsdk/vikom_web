# ViKom Handoff

**Date:** August 2026

**For:** Student development team taking over ViKom

**Status:** Early prototype, active development

**Repositories:** [`ViKom`](https://github.com/Tammzz/ViKom) (web portal + .NET backend) and [`vikom-tv-app`](https://github.com/Rahemb/vikom-tv-app) (Android TV/tablet app)

**How to read this guide:** Sections 1 and 2 explain what ViKom is and how the pieces fit together. Sections 3 to 9 walk through the code. Sections 10 and 11 get you running locally. Sections 12 to 15 describe the current state of each feature and where to start.

Feature status is marked with three symbols throughout the document:

| Symbol | Meaning |
|--------|---------|
| 🟢 | Working. We verified this in the code and, where relevant, on real devices. |
| 🟡 | Partially built or unverified. Code exists but something is missing or untested. |
| 🚧 | Planned or not started. |

## 1. Project Overview

### What is ViKom?

ViKom is a visit-support and communication platform for municipal homecare (Norwegian: _hjemmetjenesten_). It connects three user groups:

1. **Healthcare personnel (nurses)**, who use the web portal to plan, execute, and document patient visits
2. **Patients**, who use an Android TV/tablet app to see their appointments and care team, and to receive calls from caregivers
3. **Municipality leadership** (future), who would track operational metrics like failed contacts and visit stress

### The Problem It Solves

Norwegian municipal homecare is operationally complex. Nurses move between homes while juggling route lists, patient records, phone calls, and emergencies. Municipalities already own patient record systems and scheduling tools; the pain point is the fragmentation between those tools, combined with elderly patients being hard to reach digitally. Our full market analysis is in [`municipal-homecare-research-report.md`](municipal-homecare-research-report.md).

ViKom's answer is a workflow layer built around:

- **Active visit sessions** (_Besøk_) that follow a visit from start to finish: task checklist, notes, call attempts, outcome
- **Fast appointment and task management** with quick documentation
- **Digital visits** via calls to patients unable to meet in person (prototype, see Section 6 for status)
- **Repeated call attempts** to hard-to-reach elderly patients, each one logged
- **Exception handling** (patient no-answer, refusal, complications) built into the normal flow instead of being an afterthought
- **A simple TV interface** for elderly patients: big text, few choices, works with a remote

One architecture decision runs through everything: the .NET backend is the single source of truth for healthcare data (appointments, visits, clinical profiles), and Supabase is used only for patient identity (TV login) and realtime message delivery. We avoid letting Supabase become a second business database, because that would create synchronization problems and duplicate patient records.

### Current Scope (Prototype)

- 🟢 Web portal for personnel (appointment management, patient profiles, visit execution, dashboard)
- 🟢 TV app with login, appointment display, care-team view, and contacts
- 🟢 Backend API and SQLite database (system of record for clinical data)
- 🟢 Call signaling round-trip web ↔ TV via Supabase Realtime, verified end-to-end
- 🟡 Call media (actual audio): the TV app has a real WebRTC stack, but the web side still sends a placeholder offer, so no audio flows yet
- 🟡 Realtime appointment push to the TV: sender and receiver both exist, delivery is unverified (details in Section 5)
- 🚧 Analytics for leadership, route optimization

## 2. System Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ HEALTHCARE PERSONNEL                                            │
│ Web Portal (React 19 + TypeScript + Vite)                       │
│ - Login/register (backend-issued JWT, personnel only)           │
│ - Dashboard, appointments, availability, patient profiles       │
│ - Visit execution workspace (_Besøk_)                           │
│ - "Ring pasient" (call signaling to the TV)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                     HTTP REST API (port 5084)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ .NET BACKEND (ASP.NET Core 8) - system of record                │
│ Web controllers (personnel JWT):                                │
│   Auth, Appointments, Visits, Patients, Availability,           │
│   Personnel, PatientUserLinks, Dashboard                        │
│ TV controllers (Supabase JWT):                                  │
│   TvAppointments (/api/tv/appointments/mine)                    │
│   TvPatient (/api/tv/me, /api/tv/careteam/mine)                 │
│ Services: business logic per domain                             │
│ SQLite: HomeCareDatabase.db                                     │
│   Users (personnel + patients), Appointments, Visits,           │
│   VisitTasks, Availability, PatientUserLinks, CallLogs,         │
│   PatientMedications                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SUPABASE - patient identity + realtime bus (NOT business data)  │
│ Auth (GoTrue): patient sign-in for the TV app, issues JWTs      │
│ PostgreSQL: profiles, contacts, call_history, quick_dial        │
│   (TV-app-side data only - contacts list, presence, avatars)    │
│ Realtime: one broadcast channel, "webrtc-signaling", carrying   │
│   call signaling AND appointment events (filtered per user)     │
│ Edge Function: send-call-notification (triggers Firebase FCM)   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│ PATIENT TV/TABLET APP (Android, Kotlin)                         │
│ - Supabase Auth login (encrypted session storage)               │
│ - Home screen: next visit + tiles (Appointments/Contacts/Team)  │
│ - Appointments from backend GET /api/tv/appointments/mine       │
│ - Real name + care team from /api/tv/me, /api/tv/careteam/mine  │
│ - Call receiving: Supabase Realtime listener + WebRTC stack     │
│ - Contacts, profile, settings from Supabase                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Technology Boundaries

| Component | Technology | Purpose | Scope |
|-----------|-----------|---------|-------|
| Web Portal | React 19 + TypeScript + Vite | Healthcare personnel workspace | Personnel only |
| Backend API | ASP.NET Core 8 | System of record, business logic | Both web + TV |
| Database | SQLite (HomeCareDatabase.db) | Clinical data, appointments, visits | Application source of truth |
| Patient Identity | Supabase Auth (GoTrue) | Sign-in for TV app patients | TV app only |
| Realtime Bus | Supabase Realtime | Call signaling + appointment events | TV app ↔ Web app |
| Call Media | WebRTC | Audio peer-to-peer (TV side ready, web side not implemented) | TV app ↔ Browser |
| Push Notifications | Firebase FCM | Incoming call alerts when app is closed | TV app (unverified) |

### Data at Rest vs. In-Flight

- **Backend SQLite:** persistent application data (users, appointments, visits, clinical profiles, call logs)
- **Supabase PostgreSQL:** patient profiles (for TV identity resolution), contacts, call history, presence state
- **Supabase Realtime:** transient broadcast events (fire-and-forget, not persisted)
- **TV app local storage:** encrypted session tokens, plus short-lived in-memory caches for appointments and contacts. Caches are cleared on logout because a device may be shared.

### The two identity systems (read this early, it explains most confusion)

ViKom runs two separate login systems:

| System | Used by | Storage | Key field |
|--------|---------|---------|-----------|
| ASP.NET Identity | Web portal personnel | SQLite `AspNetUsers` | `Id` (GUID) |
| Supabase Auth | TV app patients | Supabase GoTrue | `id` (UUID) |

The bridge between them is one column: `User.SupabaseProfileId` in the backend. A backend patient record that stores the patient's Supabase UUID is "linked". Once linked, the TV app can fetch that patient's appointments, and the web portal can target that patient's TV with a call. Section 4 walks through the mechanics.

## 3. Repository Structure

### `ViKom` (Web Portal + .NET Backend)

```
ViKom/
├── README.md                              # Setup & prerequisites
├── municipal-homecare-research-report.md  # Market research (product context)
├── CLAUDE.md                              # Web app tech notes for AI tooling
├── ViKom.sln                              # Solution: backend + backend.Tests
│
├── backend/                               # ASP.NET Core Web API
│   ├── Program.cs                         # Startup: DI, both auth schemes, CORS, DB
│   ├── backend.csproj
│   ├── backend.http                       # Request samples (VS Code REST client)
│   ├── appsettings.json                   # Base config: connection string, Jwt section
│   ├── appsettings.Development.json       # Dev overrides: Supabase Url + AnonKey
│   │
│   ├── Controllers/
│   │   ├── AuthController.cs              # Personnel login/register (anonymous routes)
│   │   ├── AppointmentsController.cs      # Personnel: appointment CRUD
│   │   ├── VisitsController.cs            # Visit lifecycle, tasks, call attempts
│   │   ├── PatientsController.cs          # Patient roster, clinical data, call logs
│   │   ├── AvailabilityController.cs      # Nurse slots + recurring windows
│   │   ├── PersonnelController.cs         # Personnel list
│   │   ├── PatientUserLinksController.cs  # Personnel↔patient relationships
│   │   ├── DashboardController.cs         # Dashboard metrics
│   │   ├── TvControllerBase.cs            # Abstract base for all /api/tv/* (Supabase auth)
│   │   ├── TvAppointmentsController.cs    # TV: /api/tv/appointments/mine
│   │   └── TvPatientController.cs         # TV: /api/tv/me, /api/tv/careteam/mine
│   │
│   ├── Services/                          # Business logic (one per domain)
│   │   ├── AppointmentService.cs          # CRUD + emits realtime events
│   │   ├── VisitService.cs                # Visit lifecycle (start/complete/cancel)
│   │   ├── AvailabilityService.cs
│   │   ├── PatientService.cs
│   │   ├── PatientUserLinkService.cs
│   │   ├── CallLogService.cs
│   │   ├── DashboardService.cs
│   │   ├── AppointmentRealtimeEventService.cs  # STATIC helper: builds event payloads
│   │   ├── AppointmentStatusResolver.cs        # STATIC helper: display-status rule
│   │   └── SupabaseAuthentication.cs           # STATIC helper: Supabase JWT validation rules
│   │
│   ├── Models/                            # EF Core entities
│   │   ├── User.cs                        # Personnel + patients + clinical fields
│   │   ├── Appointment.cs, Visit.cs, VisitTask.cs
│   │   ├── Availability.cs, AvailabilityWindow.cs
│   │   ├── CallLog.cs, PatientUserLink.cs, PatientMedication.cs
│   │
│   ├── DAL/
│   │   ├── ApplicationDbContext.cs        # EF Core DbContext
│   │   ├── DBInit.cs                      # Demo data seeding (Development only); idempotent,
│   │   │                                  # describes desired state. One-time fixes go in Migrations/
│   │   └── Repositories/                  # 7 repository pairs (interface + implementation):
│   │                                      # Appointment, Availability, AvailabilityWindow,
│   │                                      # CallLog, PatientUserLink, User, Visit
│   ├── DTOs/                              # API request/response shapes
│   ├── Migrations/                        # EF Core migration history
│   └── Properties/launchSettings.json     # Profiles: http (5084), http-lan, https
│
├── backend.Tests/                         # xUnit tests (the only automated tests we have)
│   ├── AppointmentRealtimePayloadTests.cs
│   ├── AppointmentStatusResolverTests.cs
│   ├── SupabaseAuthenticationTests.cs
│   └── UserRepositorySupabaseLookupTests.cs
│
└── frontend/                              # React web portal
    ├── package.json                       # React 19, react-router 7, bootstrap, supabase-js
    ├── vite.config.ts                     # Dev server on 5173
    ├── .env.example                       # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    │
    └── src/
        ├── main.tsx                       # Bootstrap: imports Bootstrap CSS + icons
        ├── App.tsx                        # All routes + guards
        ├── index.css                      # Global styles + design tokens
        ├── design-system.md               # Design tokens, components, conventions - READ THIS
        │
        ├── auth/                          # AuthService.ts, LoginPage, RegisterPage,
        │   └── guards/                    # PersonnelOnlyRoute.tsx, PublicOnlyRoute.tsx
        ├── appointments/                  # pages/AppointmentListPage.tsx, components/,
        │                                  # services/AppointmentService.ts, types/
        ├── availability/                  # pages/AvailabilityCalendarPage.tsx + 8 components
        │                                  # (weekly/daily views, slot + window forms)
        ├── dashboard/                     # pages/DashboardPage.tsx →
        │                                  # components/PersonnelDashboard.tsx, services/, types/
        ├── patients/                      # pages/PatientListPage.tsx, PatientDetailsPage.tsx,
        │                                  # clinical cards in components/,
        │                                  # services/PatientService.ts, PatientUserLinkService.ts
        ├── visits/                        # VisitExecutionPage.tsx (the Besøk workspace),
        │                                  # VisitArchivePage.tsx, PlanningOverviewPage.tsx
        │                                  # (pages sit flat here - no pages/ subfolder)
        ├── components/common/             # 16 reusable components: CallModal, DataTable,
        │                                  # PageHeader, SectionCard, StatTile, StatusBadge,
        │                                  # Tabs, Timeline, Avatar, Badge, Breadcrumb, ...
        ├── services/                      # supabaseClient.ts (lazy client, call signaling),
        │                                  # SupabaseSignalingService.ts (realtime channel)
        ├── layouts/                       # Layout.tsx, NavBar.tsx, Sidebar.tsx
        ├── home/                          # HomePage.tsx (public landing)
        ├── config/config.ts               # API_URL (hardcoded http://localhost:5084)
        ├── types/                         # Auth DTOs (domain types live per-feature)
        └── utils/dateUtils.ts
```

**Key Web Files:**
- Entry: [frontend/src/main.tsx](frontend/src/main.tsx) → [frontend/src/App.tsx](frontend/src/App.tsx) (all routes)
- Auth guard: [frontend/src/auth/guards/PersonnelOnlyRoute.tsx](frontend/src/auth/guards/PersonnelOnlyRoute.tsx)
- Main workspace: [frontend/src/visits/VisitExecutionPage.tsx](frontend/src/visits/VisitExecutionPage.tsx) (_Besøk_)
- Call UI: [frontend/src/components/common/CallModal.tsx](frontend/src/components/common/CallModal.tsx)
- Signaling: [frontend/src/services/SupabaseSignalingService.ts](frontend/src/services/SupabaseSignalingService.ts)
- API config: [frontend/src/config/config.ts](frontend/src/config/config.ts)

### `vikom-tv-app` (Android TV/Tablet App)

Single-module Gradle project (root project name `TV_caller_app`, application id `com.example.tv_caller_app`). All source paths below are relative to `app/src/main/java/com/example/tv_caller_app/`.

```
vikom-tv-app/
├── build.gradle.kts                       # Root build
├── settings.gradle.kts
├── local.properties.example               # Copy to local.properties (Supabase + backend URL)
├── gradle/libs.versions.toml              # Dependency versions
├── README.md                              # App-level setup notes
│
└── app/
    ├── build.gradle.kts                   # minSdk 21, target/compile 36; injects
    │                                      # BuildConfig.SUPABASE_URL/KEY/BACKEND_BASE_URL;
    │                                      # google-services plugin applied ONLY if
    │                                      # app/google-services.json exists
    ├── src/debug/res/xml/network_security_config.xml  # Debug-only: allow plain HTTP
    │
    └── src/main/java/com/example/tv_caller_app/
        ├── TVCallerApplication.kt         # App lifecycle, singleton managers, presence,
        │                                  # cache invalidation on logout
        ├── auth/
        │   ├── SessionManager.kt          # EncryptedSharedPreferences token store
        │   └── SessionRefreshManager.kt   # Auto token refresh every 30 min
        ├── calling/
        │   ├── signaling/                 # SignalingManager.kt (realtime listener),
        │   │                              # SignalingMessage.kt (wire types)
        │   ├── webrtc/                    # WebRTCManager.kt (real peer connection),
        │   │                              # WebRTCConfig.kt (STUN/TURN), PeerConnectionObserver.kt
        │   ├── audio/                     # AudioDeviceDetector, AudioPermissionHelper,
        │   │                              # MicrophoneStatusHandler
        │   ├── permissions/PermissionHelper.kt
        │   ├── service/                   # SignalingForegroundService.kt (background listening),
        │   │                              # CallService.kt (in-call foreground service),
        │   │                              # CallNotificationManager.kt, FCMMessagingService.kt
        │   └── repository/PresenceRepository.kt   # Online/offline via Supabase RPCs
        ├── repository/                    # AppointmentRepository, AuthRepository,
        │                                  # PatientProfileRepository (name + care team),
        │                                  # ContactRepository, CallHistoryRepository,
        │                                  # QuickDialRepository, ProfileRepository, FCMRepository
        ├── datasource/                    # Interfaces (AppointmentDataSource, WebRTCDataSource
        │                                  # with MicrophoneMode enum, ...) + exception types
        ├── network/
        │   ├── BackendApiClient.kt        # HTTP client + base URL for the .NET backend
        │   ├── BackendGet.kt              # THE shared authenticated-GET helper (see §8)
        │   └── SupabaseClient.kt          # Singleton Supabase client
        ├── model/                         # Appointment, Contact, Profile, PatientProfile
        │                                  # (+CareTeamMember), CallHistory, FcmCallData, ...
        ├── settings/SettingsManager.kt    # Language (default Norwegian), ringtone, etc.
        ├── ui/
        │   ├── activities/                # AuthActivity (entry), WelcomeActivity, MainActivity,
        │   │                              # AppointmentActivity, IncomingCallActivity,
        │   │                              # InCallActivity, OutgoingCallActivity
        │   ├── fragments/                 # HomeFragment (hero + tiles), AppointmentListFragment,
        │   │                              # CareTeamFragment, AllContactsFragment,
        │   │                              # ContactDetailFragment, ProfileFragment,
        │   │                              # SettingsFragment, HamburgerMenuFragment,
        │   │                              # LoginFragment, RegisterFragment,
        │   │                              # EmailVerificationFragment
        │   ├── adapters/                  # DayGroupedAppointmentAdapter, ContactListAdapter,
        │   │                              # CareTeamAdapter
        │   └── util/                      # AppointmentStatusUi.kt, AvatarHelper.kt
        ├── viewmodel/                     # AuthViewModel, AppointmentsViewModel, CallViewModel,
        │                                  # ContactsViewModel, ProfileViewModel + factories
        └── res/                           # values/strings.xml (Norwegian default),
                                           # values-en/ (English), size-bucket dimens for TV
```

**Key Android Files:**
- App entry: `TVCallerApplication.kt` + `ui/activities/AuthActivity.kt` (the launcher activity)
- Home screen: `ui/fragments/HomeFragment.kt` (next-visit hero card + navigation tiles)
- Appointments: `ui/fragments/AppointmentListFragment.kt` → `viewmodel/AppointmentsViewModel.kt` → `repository/AppointmentRepository.kt`
- Backend access: `network/BackendGet.kt` (every backend call goes through this)
- Calling: `calling/signaling/SignalingManager.kt` (listener) + `calling/webrtc/WebRTCManager.kt` (media)
- Background listening: `calling/service/SignalingForegroundService.kt`
- Auth: `auth/SessionManager.kt` (encrypted storage), `repository/AuthRepository.kt` (Supabase Auth calls)

A naming note: older documents refer to this repo as `vikom_project-main` and to an `AppointmentsFragment` and `QuickDialFragment`. Those names are stale. The repo is `vikom-tv-app`, the appointment list fragment is `AppointmentListFragment.kt`, and the quick-dial tab was removed in the redesign. Quick-dial contacts now appear as a "Foreslått" section at the top of `AllContactsFragment`.

## 4. Authentication and User Mapping

### Web Portal Authentication (Personnel)

**Flow:**
1. User submits username + password on the login form
2. `AuthController.Login()` validates credentials against ASP.NET Identity
3. If the account's role is anything other than `Personnel`, login is rejected with 403 ("Portalen er kun for helsepersonell"). The portal is personnel-only by design.
4. On success the backend generates a JWT (HS256, signed with `Jwt:Key` from appsettings, 24h expiry) containing the user id, name, and role claims
5. The frontend stores the token in `localStorage` (`jwt`) plus a small `userInfo` object (`userName`, `fullName`, `role`, `userId`)
6. Every API call sends `Authorization: Bearer <token>`, which the backend validates via the default JWT scheme in `Program.cs`

Registration is open, but the backend hard-codes the `Personnel` role server-side, so the client cannot choose a role ([backend/Controllers/AuthController.cs](backend/Controllers/AuthController.cs)). Patients are never created through the portal's register page.

**Files:**
- Backend: [backend/Controllers/AuthController.cs](backend/Controllers/AuthController.cs) (login/register/JWT generation)
- Backend: [backend/Program.cs](backend/Program.cs) (both auth scheme registrations)
- Frontend: [frontend/src/auth/AuthService.ts](frontend/src/auth/AuthService.ts) (API calls + localStorage)
- Frontend: [frontend/src/auth/guards/PersonnelOnlyRoute.tsx](frontend/src/auth/guards/PersonnelOnlyRoute.tsx) (route guard: token present + stored role === "Personnel")

Two details worth knowing:
- All eight web controllers carry a class-level `[Authorize(Roles = "Personnel")]`. Only `AuthController`'s routes are anonymous.
- The frontend guard trusts the stored role string and doesn't decode the JWT client-side. There is also no global "token expired → redirect to login" handling yet, so an expired token surfaces as failed API calls on whatever page you're on.

### TV App Authentication (Patients)

**Flow:**
1. Patient signs in with email + password via Supabase Auth (GoTrue). Sign-in is blocked until the email is verified.
2. Supabase issues an access token (HS256 JWT signed with the project's JWT secret)
3. The TV app stores the session in `EncryptedSharedPreferences` (`auth/SessionManager.kt`)
4. `SessionRefreshManager` refreshes the token every 30 minutes, and the app also refreshes when brought to the foreground
5. Backend calls under `/api/tv/*` send the Supabase token as the bearer credential

Backend validation ([backend/Services/SupabaseAuthentication.cs](backend/Services/SupabaseAuthentication.cs)) registers a second authentication scheme named `SupabaseJwt` that checks:
- issuer = `{supabase-url}/auth/v1`
- audience = `"authenticated"`
- signature = HS256 with the secret from .NET user-secrets (`Supabase:JwtSecret`)

If the secret is missing or too short, the scheme is configured to reject everything. The backend still starts and the portal still works, but `/api/tv/*` returns 401 and a warning is logged at startup.

**Files:**
- TV app: `auth/SessionManager.kt` (encrypted storage), `auth/SessionRefreshManager.kt` (refresh), `repository/AuthRepository.kt` (Supabase Auth calls)
- Backend: [backend/Services/SupabaseAuthentication.cs](backend/Services/SupabaseAuthentication.cs), [backend/Controllers/TvControllerBase.cs](backend/Controllers/TvControllerBase.cs)

### User and Patient Mapping

When a patient exists in the backend:
- A backend `User` row has `Role = "Patient"`
- If the patient is known in Supabase, their Supabase UUID is stored in `User.SupabaseProfileId`
- `PatientUserLink` rows connect the patient to their care team:
  - `PatientId` = patient's backend `User.Id`
  - `SecondaryUserId` = the linked person's backend `User.Id` (e.g. their nurse)
  - `RelationshipType` = `"Personnel"` or `"Relative"`

**Lookup flow (every `/api/tv/*` request):**
1. TV app sends its Supabase token. The token's `sub` claim is the patient's Supabase UUID.
2. The shared base class [backend/Controllers/TvControllerBase.cs](backend/Controllers/TvControllerBase.cs) resolves the caller: it reads `sub`, then calls `UserRepository.GetBySupabaseProfileIdAsync()`
3. Outcomes: 401 if the token has no `sub`; 404 ("No patient is linked to this Supabase profile") if no backend user has that UUID; 403 if the matched user isn't a `Patient`. Otherwise the request proceeds with the resolved backend user.

That 404 is the single most common cause of "why doesn't the TV show anything": the Supabase account exists, but no backend patient row carries its UUID.

Personnel set that link from the portal: **Pasienter → Ny pasient** registers a patient (`POST /api/patients`) and its Supabase field searches the `profiles` table by username through `GET /api/patients/supabase-profiles`, so the account is confirmed to exist before it is saved. Only `SupabaseProfileId` is written — the patient's URL handle is never changed by linking. The same field is in the edit dialog, so an existing patient can be linked, relinked or unlinked. The seeder ([backend/DAL/DBInit.cs](backend/DAL/DBInit.cs)) still sets it for the demo patients, but it is no longer the only way.

Two things the portal deliberately does **not** do: it never creates Supabase auth accounts (that needs a `service_role` key, so patient TV logins are still made in the TV app or the Supabase dashboard), and patients it creates get no portal password — they authenticate through Supabase, and the portal login is personnel-only.

**Files:**
- Model: [backend/Models/User.cs](backend/Models/User.cs) (`SupabaseProfileId`), [backend/Models/PatientUserLink.cs](backend/Models/PatientUserLink.cs)
- Resolution: [backend/Controllers/TvControllerBase.cs](backend/Controllers/TvControllerBase.cs)
- Lookup: `UserRepository.GetBySupabaseProfileIdAsync` in [backend/DAL/Repositories/UserRepository.cs](backend/DAL/Repositories/UserRepository.cs) (backed by a unique index)

**Demo Data (Development only, all passwords `Pass123!`):**

| Backend account | Full name | Role | SupabaseProfileId |
|---|---|---|---|
| `nurse@homecare.local` | Nurse Nora | Personnel | (none) |
| `patient.ingrid@homecare.local` | Ingrid Berg | Patient | `c9f53a55-1375-48e6-95ce-25917f55be2d` |
| `patient.wayki@homecare.local` | Bong Wayki | Patient | `4fb30313-b8e6-4381-896c-d345b5d3bd72` |

Both patients are linked to Nurse Nora via seeded `PatientUserLink` rows (type `Personnel`). The seeder also creates availability windows, clinical profiles with medications, and 5 demo appointments (2 planned + 3 completed with visit records) that all belong to Ingrid. Only Ingrid has a working TV login (`ingrid.berg@example.com` / `Pass123!` in Supabase). Bong Wayki maps to the Supabase profile `wayki` (device type `tv`) and is the account used for testing on a real TV; he starts with no appointments on purpose, so book one for him in the portal to see the TV appointment view fill in.

## 5. Appointment Functionality

### Appointment Entity & Status

[backend/Models/Appointment.cs](backend/Models/Appointment.cs):

```csharp
public class Appointment
{
    public int Id { get; set; }
    public string PatientId { get; set; }    // FK to the patient (User.Id)
    public int AvailabilityId { get; set; }  // FK to the nurse time slot
    public string Tasks { get; set; }        // Comma-separated task list (kept simple on purpose)
    public TimeSpan StartTime { get; set; }  // Copied from the Availability slot
    public TimeSpan EndTime { get; set; }
    public string Status { get; set; }       // See below
    public Visit? Visit { get; set; }        // One-to-one execution record (null until started)
}
```

There is no `PersonnelId` on the appointment. The responsible nurse is reached through `Availability.PersonnelId`, since an appointment books a nurse's slot.

**Status values:** `Booked`, `InProgress`, `Completed`, `NotCompleted`, `Cancelled`.
The allowed transitions are enforced in [backend/Services/AppointmentService.cs](backend/Services/AppointmentService.cs): `Booked→InProgress`, `Booked→Cancelled`, `InProgress→Completed`, `InProgress→Cancelled`, and nothing else. `NotCompleted` passes the model's validation but no API path can currently reach it; visit outcomes use `Visit.OutcomeReason` instead.

### 1. Create Appointment (Web Portal)

**UI:** [frontend/src/appointments/pages/AppointmentListPage.tsx](frontend/src/appointments/pages/AppointmentListPage.tsx)

1. Personnel picks a patient, a free nurse time slot (from the availability endpoints), and a task list
2. Frontend POSTs to `/api/appointments`
3. `AppointmentsController` → `AppointmentService.CreateAsync()`: validates the slot isn't already booked, creates the appointment with `Status = "Booked"`
4. The service then tries to emit a realtime event (next subsection)

### 2. Realtime appointment events 🟡 (wired on both ends, delivery unverified)

This is the part of the system most likely to confuse you, so here is the current state.

The backend emits. `AppointmentService.EmitAppointmentRealtimeEventAsync` ([backend/Services/AppointmentService.cs](backend/Services/AppointmentService.cs)) runs on create, update, and cancel. It skips silently if the patient has no `SupabaseProfileId`. Otherwise it builds a payload via the static [backend/Services/AppointmentRealtimeEventService.cs](backend/Services/AppointmentRealtimeEventService.cs) (wrapper `{ targetUserId, type: "appointment_event", payload: <JSON string> }`) and POSTs it to Supabase over HTTP.

The TV app listens. `SignalingManager.kt` handles `appointment_event` on the shared `webrtc-signaling` channel, `CallViewModel.handleAppointmentEvent()` invalidates the appointment cache, and `SignalingForegroundService` launches a full-screen `AppointmentActivity` to inform the patient (deferred if a call is in progress). The payload field names match the backend.

The suspected break is the transport. The backend POSTs to `{supabaseUrl}/realtime/v1/api/broadcast/webrtc-signaling/events/message`, while Supabase's REST broadcast endpoint is `POST /realtime/v1/api/broadcast` with a `{"messages":[{"topic","event","payload"}]}` body. Any failure is caught and only logged as a warning, so appointment writes always succeed even when the broadcast doesn't go out. We have not observed an event arriving on a TV. Fixing and verifying this is the top candidate task for your team (Section 15).

Because of this, the TV app's appointment list doesn't depend on realtime. `AppointmentListFragment` force-refreshes from the backend every time it resumes, and the repository's 5-minute cache only serves data when the network fails. Once verified, the realtime path adds an instant full-screen notification on top of that.

Test coverage: [backend.Tests/AppointmentRealtimePayloadTests.cs](backend.Tests/AppointmentRealtimePayloadTests.cs) pins the payload and wrapper shape, so the TV contract can't drift silently. Nothing tests the HTTP send itself.

### 3. TV App: Fetch Appointments

1. On resume, `AppointmentsViewModel` calls `AppointmentRepository.getMyAppointments(forceRefresh = true)`
2. The request goes through `network/BackendGet.kt`, which attaches the Supabase bearer token, retries once after a 401 (refreshing the session first), and maps 404 to a "profile not linked" state
3. Backend `GET /api/tv/appointments/mine` resolves the caller (Section 4) and returns their appointments
4. The list renders grouped by day (`DayGroupedAppointmentAdapter`), and `HomeFragment` shows the next upcoming visit as a hero card

The TV-side model (`model/Appointment.kt`) is its own display shape and doesn't mirror the backend entity: `{ id, personnelName, date, startTime, endTime, tasks, availabilityNotes, status }`, all-nullable strings with `java.time` helper extensions. Unknown JSON fields are ignored, so the backend can evolve additively without breaking the TV.

### 4. Appointment Status Resolution

[backend/Services/AppointmentStatusResolver.cs](backend/Services/AppointmentStatusResolver.cs) is a small static rule applied when appointments are mapped to DTOs or realtime payloads:

- If the stored status is `Booked` and the appointment's end time has passed, report `Completed` (without writing to the database)
- Otherwise return the stored status unchanged

This keeps displays sensible without a background job flipping statuses. Covered by [backend.Tests/AppointmentStatusResolverTests.cs](backend.Tests/AppointmentStatusResolverTests.cs).

### 5. Visit Execution (_Besøk_)

When a nurse opens `/besok/:appointmentId`, the page starts (or resumes) a `Visit`: the execution record, one-to-one with the appointment.

**UI:** [frontend/src/visits/VisitExecutionPage.tsx](frontend/src/visits/VisitExecutionPage.tsx)

- `POST /api/visits/start` creates the visit if none exists, and the appointment goes `Booked → InProgress`
- The workspace shows a live session timer, the patient's clinical context cards inline, the task checklist (complete, skip-with-reason, or add ad-hoc tasks), and auto-saving notes (debounced 1.5s plus save-on-blur)
- Up to 3 call attempts can be made ("Ring pasient" / "Ring igjen"), with one-click outcome shortcuts ("patient declined", "patient unavailable")
- The visit ends with Complete (optional follow-up flag) or Cancel with a structured reason

**Visit model** ([backend/Models/Visit.cs](backend/Models/Visit.cs)):

```csharp
public class Visit
{
    public int AppointmentId { get; set; }
    public string PatientId { get; set; }         // Denormalized for querying
    public string ResponsibleUserId { get; set; } // The nurse running the visit
    public string VisitType { get; set; }         // "Physical" | "Digital"
    public string Status { get; set; }            // "Active" | "Completed" | "Incomplete" | "Cancelled"
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? Notes { get; set; }
    public bool FollowUpRequired { get; set; }
    public string? OutcomeReason { get; set; }    // e.g. "Pasienten svarte ikke"
    public ICollection<VisitTask> Tasks { get; set; }  // Pending | Completed | Skipped
}
```

**Files:** [backend/Services/VisitService.cs](backend/Services/VisitService.cs), [backend/Controllers/VisitsController.cs](backend/Controllers/VisitsController.cs), [frontend/src/visits/VisitExecutionPage.tsx](frontend/src/visits/VisitExecutionPage.tsx)

## 6. Call / Signaling / WebRTC Flow

Current status: the signaling round-trip (ring → incoming-call screen on TV → accept/reject → answer back to the web) works end-to-end and has been verified on real devices. The media layer (actual audio) is not implemented on the web side. The browser sends a placeholder ("dummy") SDP instead of a real WebRTC offer, so no audio ever flows. The TV side already has a full WebRTC stack waiting for a real counterpart. Implementing browser-side media is the missing piece (Section 15).

Two WebRTC terms you'll meet constantly:
- **Signaling**: the messages two devices exchange to set up a call (offer, answer, network candidates). ViKom sends these over a Supabase Realtime broadcast channel.
- **SDP**: the text blob describing a device's media capabilities. A real call needs real SDP from both sides. Ours currently says `"dummy_sdp_offer_data"` on the web side.

### The flow as it exists today

1. The nurse clicks "Ring pasient", either from the patient profile header or from the Besøk workspace. [frontend/src/components/common/CallModal.tsx](frontend/src/components/common/CallModal.tsx) opens.
2. The web sends `call_offer`. [frontend/src/services/SupabaseSignalingService.ts](frontend/src/services/SupabaseSignalingService.ts) subscribes to the `webrtc-signaling` broadcast channel and sends a wrapper `{ targetUserId: <patient's SupabaseProfileId>, type: "call_offer", payload: <JSON string> }`. The inner payload carries `callerId`, `callerUserId`, `callerName`, `callerUsername`, `sdp` (dummy), and `mediaType`.
3. The TV receives it. `SignalingManager.kt` listens on the same channel, drops messages whose `targetUserId` doesn't match the signed-in user, deserializes the offer, and emits an incoming-call event. `SignalingForegroundService` launches the full-screen `IncomingCallActivity` (ringtone, accept/reject).
4. The patient answers. Accept sends `call_answer` back over the channel (reject sends `call_rejected`), and the web `CallModal` leaves its "Ringer…" state accordingly. Hang-up on either side sends `call_ended`.
5. What does NOT happen yet: no `RTCPeerConnection` is created in the browser, no ICE candidates are exchanged from the web side, and no audio or video tracks flow. The TV's `WebRTCManager` is ready to do the real handshake once the web sends real SDP.

```
Web Portal (browser)                         TV App (Android)
      │                                            │
      │ 1. "Ring pasient" → CallModal              │
      │ 2. call_offer (dummy SDP) ───────────────► │
      │        via Supabase Realtime               │ 3. SignalingManager matches
      │        channel "webrtc-signaling"          │    targetUserId, launches
      │                                            │    IncomingCallActivity
      │ ◄─────────────── call_answer / rejected 4. │
      │ 5. CallModal state updates                 │
      │                                            │
      ╳ 6. Real media handshake (offer/answer/ICE  │
        + audio tracks) - NOT IMPLEMENTED web-side │
```

### What works on each side

Web frontend:
- `SupabaseSignalingService.ts` creates the Supabase client lazily (only when configured via `.env.local`), subscribes to the channel, filters by `targetUserId`, sends `call_offer` and `call_ended`, and receives `call_answer`, `call_rejected`, and `call_ended`
- Call attempts are logged as data. `CallModal` creates a `CallLog` through the backend (`POST /api/visits/{id}/call-attempts` during a visit, `POST /api/patients/{id}/calls` otherwise) and updates its status (`Initiated`/`Answered`/`Declined`/`Ended`/`Missed`). This feeds the visit documentation.

TV app:
- `SignalingManager.kt` handles `call_offer`, `call_answer`, `ice_candidate`, `call_rejected`, `call_ended`, and `appointment_event` (Section 5), plus a tolerant fallback parser for untyped messages
- `WebRTCManager.kt` is a real peer connection factory with audio tracks, ICE handling, and microphone-aware modes: `TWO_WAY` when a microphone is available and permitted, `RECEIVE_ONLY` otherwise (listen-only call). Hot-plugging a microphone is detected.
- `WebRTCConfig.kt` configures 5 Google STUN servers plus a public TURN relay (see the risk note in Section 13)
- `SignalingForegroundService` keeps listening while the app is backgrounded, and `CallService` runs during an active call

### Signaling contract (keep both sides identical!)

Channel: `webrtc-signaling`, broadcast event name `"message"`. Wrapper:

```json
{
  "targetUserId": "<recipient's Supabase UUID>",
  "type": "call_offer | call_answer | call_rejected | call_ended | ice_candidate | appointment_event",
  "payload": "<JSON-encoded STRING (not a nested object)>"
}
```

A gotcha that has bitten us before: the TV deserializes `call_offer` into a Kotlin class whose fields (`callerId`, `callerUserId`, `callerName`, `callerUsername`, `sdp`) are all required. If the web omits `callerUsername`, or any field name drifts, deserialization fails silently and the incoming-call screen never appears. If you change the contract, change `SignalingMessage.kt` and `SupabaseSignalingService.ts` together.

Also note that everyone shares this one channel and filtering happens client-side by `targetUserId`. That works for a prototype but is a privacy issue to fix before handling real patient data (Section 13).

### Push Notifications (Incoming calls when the app is closed)

When the TV app is fully closed, the Realtime listener isn't running. The intended path is Firebase Cloud Messaging (FCM):

- The TV app registers its FCM token into the Supabase `profiles.fcm_token` column (`repository/FCMRepository.kt`) and can invoke the Supabase Edge Function `send-call-notification`
- `calling/service/FCMMessagingService.kt` handles incoming `incoming_call` data messages and raises a high-priority notification

Status: 🟡 wired in code, unverified in practice. The google-services Gradle plugin is applied only if `app/google-services.json` exists (it is gitignored and not in the repo), and we have not tested closed-app call delivery end-to-end. Don't rely on it until verified.

## 7. Backend API Overview

All routes below were checked against the controllers at the time of writing. When running in Development, explore them live at http://localhost:5084/swagger.

Two authentication schemes exist (Section 4). "Personnel" below means the default JWT scheme plus `[Authorize(Roles = "Personnel")]`; "Supabase" means the `SupabaseJwt` scheme via `TvControllerBase`.

#### AuthController - [backend/Controllers/AuthController.cs](backend/Controllers/AuthController.cs)
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | None | Create personnel account (role forced to Personnel server-side) |
| `/api/auth/login` | POST | None | Issue JWT; 403 for non-personnel accounts |
| `/api/auth/logout` | POST | None | Logout hook (token removal is client-side) |

#### AppointmentsController - [backend/Controllers/AppointmentsController.cs](backend/Controllers/AppointmentsController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/appointments` | GET | List all appointments |
| `/api/appointments/{id}` | GET | Single appointment |
| `/api/appointments/patient/{patientId}` | GET | Appointments for a patient |
| `/api/appointments/personnel/{personnelId}` | GET | Appointments for a nurse |
| `/api/appointments` | POST | Create (validates the slot, emits realtime event) |
| `/api/appointments/{id}` | PUT | Update (status transitions enforced) |
| `/api/appointments/{id}` | DELETE | Soft-cancel (sets Status = "Cancelled") |

#### VisitsController - [backend/Controllers/VisitsController.cs](backend/Controllers/VisitsController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/visits/start` | POST | Start or resume the visit for an appointment |
| `/api/visits/{id}` | GET | Visit details |
| `/api/visits/by-appointment/{appointmentId}` | GET | Visit for an appointment |
| `/api/visits/by-patient/{patientId}` | GET | A patient's visits |
| `/api/visits/mine` | GET | The signed-in nurse's visits |
| `/api/visits/{id}/notes` | PUT | Update visit notes (used by autosave) |
| `/api/visits/{id}/tasks` | POST | Add a task to the visit |
| `/api/visits/{id}/tasks/{taskId}` | PUT | Complete/skip a task |
| `/api/visits/{id}/complete` | POST | Complete the visit |
| `/api/visits/{id}/cancel` | POST | Cancel with a reason |
| `/api/visits/{id}/call-attempts` | POST | Log a call attempt during the visit |

#### PatientsController - [backend/Controllers/PatientsController.cs](backend/Controllers/PatientsController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patients` | GET | Patients linked to the signed-in nurse |
| `/api/patients` | POST | Register a patient (links them to the caller, optional Supabase link) |
| `/api/patients/all` | GET | All patients |
| `/api/patients/supabase-profiles` | GET | Search Supabase `profiles` for the TV-link picker (service-role key, server-side) |
| `/api/patients/supabase-profiles/{profileId}` | GET | Resolve one Supabase profile so an existing link shows a name |
| `/api/patients/{id}` | GET | Profile + clinical data |
| `/api/patients/{id}` | PUT | Update profile and Supabase (TV) link |
| `/api/patients/{id}/notes` | PUT | Update patient notes |
| `/api/patients/{id}/calls` | POST | Log a call (outside a visit) |
| `/api/patients/{id}/calls/{callId}` | PUT | Update a call log's status |

#### AvailabilityController - [backend/Controllers/AvailabilityController.cs](backend/Controllers/AvailabilityController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/availability` | GET | All slots |
| `/api/availability/{id}` | GET | Single slot |
| `/api/availability/personnel/{personnelId}` | GET | A nurse's slots |
| `/api/availability/free` | GET | Unbooked slots |
| `/api/availability` | POST / PUT `/{id}` / DELETE `/{id}` | Slot CRUD |
| `/api/availability/week/{personnelId}?startDate=` | GET | Week view |
| `/api/availability/day/{personnelId}?date=` | GET | Day view |
| `/api/availability/window` | POST / PUT `/{id}` / DELETE `/{id}` | Recurring window CRUD (windows generate slots) |

#### PersonnelController - [backend/Controllers/PersonnelController.cs](backend/Controllers/PersonnelController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/personnel` | GET | List all personnel |

#### PatientUserLinksController - [backend/Controllers/PatientUserLinksController.cs](backend/Controllers/PatientUserLinksController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patientuserlinks` | GET / POST | List all links / create link |
| `/api/patientuserlinks/{id}` | GET / DELETE | Single link / remove link |
| `/api/patientuserlinks/patient/{patientId}` | GET | Links for a patient |
| `/api/patientuserlinks/secondary/{secondaryUserId}` | GET | Links for a nurse/relative |

#### DashboardController - [backend/Controllers/DashboardController.cs](backend/Controllers/DashboardController.cs) (Personnel)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dashboard/personnel` | GET | Dashboard for the signed-in nurse (used by the portal) |
| `/api/dashboard/personnel/{personnelId}` | GET | Dashboard for a specific nurse |
| `/api/dashboard/patient/{patientId}` | GET | Patient-centric metrics |

#### TV endpoints - Supabase auth via [backend/Controllers/TvControllerBase.cs](backend/Controllers/TvControllerBase.cs)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tv/appointments/mine` | GET | Signed-in patient's appointments ([backend/Controllers/TvAppointmentsController.cs](backend/Controllers/TvAppointmentsController.cs)) |
| `/api/tv/me` | GET | Patient's full name + username ([backend/Controllers/TvPatientController.cs](backend/Controllers/TvPatientController.cs)); drives the TV greeting |
| `/api/tv/careteam/mine` | GET | Patient's care team (name, relationship, phone); drives the TV care-team screen |

There is no separate CallLog or VisitTask controller. Call logs and visit tasks are sub-resources of patients and visits, as shown above.

## 8. Android/TV Application Structure

### Application Layers (MVVM)

```
UI (Activities/Fragments)  →  ViewModels (state & logic)  →  Repositories (data + caching)
                                                                    │
                                              ┌─────────────────────┼──────────────────────┐
                                        BackendGet.kt         SupabaseClient          SessionManager
                                        (HTTP to .NET,        (auth, postgrest,      (encrypted tokens)
                                         auth + retry)         realtime, functions)
```

### The pieces worth understanding first

**`network/BackendGet.kt`.** Every call to the .NET backend goes through this one helper. It builds the URL from `BuildConfig.BACKEND_BASE_URL`, attaches the Supabase bearer token, retries exactly once after a 401 (refreshing the session first), and maps failures to typed exceptions the UI understands: `BackendNotConfiguredException` (no base URL), `SessionExpiredException`, and `ProfileNotLinkedException` (backend 404 = unmapped patient). If you add a backend call, use this helper instead of writing your own HTTP code.

**Repositories and caching.** `AppointmentRepository`, `ContactRepository`, `CallHistoryRepository`, and `QuickDialRepository` each keep a 5-minute in-memory cache. `PatientProfileRepository` (name + care team) caches for 30 minutes. The caches are fallbacks: screens force-refresh on resume, and the cache serves stale data only when the network fails. `TVCallerApplication.invalidateAllCaches()` clears everything on logout because a TV or tablet may be shared between patients.

**Application lifecycle (`TVCallerApplication.kt`).** Creates the singleton managers, starts presence tracking (`startPresence("tv")`, 30s heartbeat), refreshes the session on foreground, and registers the FCM token defensively, since FCM init fails without `google-services.json`.

**Screens.**
- `AuthActivity` (launcher) hosts `LoginFragment` / `RegisterFragment` / `EmailVerificationFragment` → `WelcomeActivity` → `MainActivity`
- `MainActivity` hosts the fragments and shows a greeting that swaps in the patient's real name once `/api/tv/me` responds. It is also the place that starts `SignalingForegroundService`, which means background call reception only begins once the user has reached the main screen.
- `HomeFragment` is the redesigned home: a hero card with the next visit, plus tiles for Appointments, Contacts, and Care team
- `AppointmentListFragment` shows the day-grouped appointment list, with status colors via `ui/util/AppointmentStatusUi.kt`
- `CareTeamFragment` is a read-only care team view fed by `/api/tv/careteam/mine`
- `AllContactsFragment` shows searchable contacts (from Supabase) with a "Foreslått" (suggested) quick-dial section on top
- Call screens: `IncomingCallActivity`, `InCallActivity`, `OutgoingCallActivity`. Realtime appointment notifications open the full-screen `AppointmentActivity`.

**Accessibility for elderly users.** Norwegian is the default language (`values/strings.xml`; English in `values-en/`, currently missing around 29 translations). Layout dimensions scale up through `values-television/`, `values-sw600dp/`, and `values-sw720dp/` resource buckets. Settings (language, ringtone, auto-answer, vibration) live in `settings/SettingsManager.kt`.

### Data Models (TV side)

```kotlin
// From the backend (display shape - unknown JSON fields are ignored)
data class Appointment(
    val id: Int = 0,
    val personnelName: String? = null,
    val date: String? = null,        // "yyyy-MM-dd"
    val startTime: String? = null,   // "HH:mm"
    val endTime: String? = null,
    val tasks: String? = null,       // comma-separated
    val availabilityNotes: String? = null,
    val status: String = "Booked"
)

// From /api/tv/me and /api/tv/careteam/mine
data class PatientProfile(val fullName: String, val userName: String?)
data class CareTeamMember(val fullName: String, val relationshipType: String, val phoneNumber: String?)

// From Supabase (contacts/presence)
data class Contact(val id: String, val user_id: String, val contact_id: Int,
                   val username: String?, val email: String?, /* ... */)
data class Profile(val id: String, val username: String?, val contact_id: Int,
                   val is_online: Boolean, val webrtc_status: String, /* ... */)
```

Heads-up: the Supabase `profiles` table also has an `fcm_token` column that `FCMRepository` writes, but the Kotlin `Profile` class doesn't declare it. It's updated untyped.

### Build facts

- minSdk 21, target/compile SDK 36, Kotlin 2.0.21, Java 11 target, core-library desugaring (for `java.time` on old devices)
- Supabase Kotlin SDK 2.6.1 (`io.github.jan-tennert.supabase`: gotrue, postgrest, realtime, functions, storage) over Ktor 2.3.12
- WebRTC via `io.getstream:stream-webrtc-android:1.3.8`, a maintained fork of Google's library. The package namespace is still `org.webrtc`, but it is not the official Google artifact.
- Firebase BoM 33.7.0 (messaging); google-services plugin applied only if `app/google-services.json` exists
- Debug builds allow cleartext HTTP for all hosts (`src/debug/.../network_security_config.xml`) so a dev backend over plain HTTP works. Release builds don't.

## 9. Web Application Structure

### Routes ([frontend/src/App.tsx](frontend/src/App.tsx))

**Public:** `/` (landing), `/login`, `/register` (login and register redirect to `/dashboard` if already signed in)

**Personnel-only (wrapped in `PersonnelOnlyRoute`):**
- `/dashboard`: the nurse's homepage
- `/appointments`: appointment list, create/edit/cancel
- `/appointments/archive`: historical visits (reached from buttons on the appointments page; there is no sidebar link)
- `/availability`: availability calendar (weekly/daily views, slots + recurring windows)
- `/patients` and `/patients/:username`: roster and clinical profile (the URL uses the patient's profile username, falling back to their GUID)
- `/besok/:appointmentId`: the Besøk visit workspace (append `?type=Digital` to start a digital visit)
- `/planning`: planning overview (early page, includes an area-map placeholder)

### Key Components

- **Dashboard**: [frontend/src/dashboard/components/PersonnelDashboard.tsx](frontend/src/dashboard/components/PersonnelDashboard.tsx), fed by `GET /api/dashboard/personnel`. Welcome header, four stat tiles (patients / this week / planned / cancelled), a month calendar, today's timeline, upcoming availability, and recent appointments. This page exists and works; older docs listed the dashboard as planned.
- **Appointments**: [frontend/src/appointments/pages/AppointmentListPage.tsx](frontend/src/appointments/pages/AppointmentListPage.tsx) with form/modal components for create, edit, and delete.
- **Visits**: [frontend/src/visits/VisitExecutionPage.tsx](frontend/src/visits/VisitExecutionPage.tsx) (Section 5), plus `VisitArchivePage` (filter tabs) and modals for planned-visit preview and post-visit details.
- **Patients**: roster and clinical profile assembled from cards (`ClinicalOverviewCard`, `DiagnosesCard`, `MedicationsCard`, `TreatmentPlanCard`, `PatientNotesCard`, `EditPatientModal`). The profile header hosts the "Ring pasient" button and a badge showing whether the patient is TV-linked. `CreatePatientModal` (from "Ny pasient" on the roster) registers a patient, and both modals embed `SupabaseProfileField`, which searches Supabase `profiles` via `GET /api/patients/supabase-profiles` so the TV link is picked from real accounts. That search goes through the backend on purpose — portal users hold a backend JWT and have no Supabase session, so a browser-side query would run as `anon` and force `profiles` to allow anonymous SELECT. Linking writes **only** `SupabaseProfileId`; the patient's `ProfileUsername` (their `/patients/{username}` URL handle) is a separate local value that the portal never touches.
- **Calling**: [frontend/src/components/common/CallModal.tsx](frontend/src/components/common/CallModal.tsx) + [frontend/src/services/SupabaseSignalingService.ts](frontend/src/services/SupabaseSignalingService.ts) (Section 6).
- **Shared UI**: 16 components in [frontend/src/components/common/](frontend/src/components/common/): `PageHeader`, `SectionCard`, `StatTile`, `StatusBadge`, `DataTable`, `Tabs`, `Timeline`, `EmptyState`, `Avatar`, `Badge`, `Breadcrumb`, `IconButton`, `InfoRow`, `TaskBadges`, `CallModal`. Reuse these before building new ones.

### Styling

- Bootstrap 5 + Bootstrap Icons + React-Bootstrap (imported in `main.tsx`). Use Bootstrap Icons (`bi-*`) for all icons.
- Design tokens (brand colors, spacing, font sizes, radius, shadows) are CSS custom properties in [frontend/src/index.css](frontend/src/index.css), overriding Bootstrap's variables.
- One plain co-located CSS file per page/component (no CSS modules).
- Read [frontend/src/design-system.md](frontend/src/design-system.md) before building UI. It documents the tokens, the component library, and do/don't conventions.

### Configuration

[frontend/src/config/config.ts](frontend/src/config/config.ts) hardcodes the backend URL:

```typescript
export const API_URL = 'http://localhost:5084';
```

There is no env override for it, so change the file if your backend runs elsewhere. Worth improving.

Supabase (needed only for "Ring pasient") comes from `.env.local`, copied from [frontend/.env.example](frontend/.env.example):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Every feature has its own small service module (`AppointmentService.ts`, `VisitService.ts`, and so on) that wraps `fetch` with the auth header. There is no shared HTTP client or global 401 handling yet; that's a known cleanup opportunity.

## 10. Setup Instructions

### Prerequisites

- Windows 10+, macOS, or Linux
- .NET 8.0 SDK
- Node.js 22+
- Android Studio (for the TV app)
- A Supabase project (free tier is fine). Needed for TV login and calling; the web portal runs without it.

### Clone Repositories

```bash
git clone https://github.com/Tammzz/ViKom.git        # web portal + backend
git clone https://github.com/Rahemb/vikom-tv-app.git # TV app
```

### Backend Setup (.NET)

```bash
cd ViKom
dotnet restore
```

**1. Supabase project config.** `backend/appsettings.Development.json` already contains a Supabase `Url` and `AnonKey` for the team's dev project. To use your own project, replace them (Supabase Dashboard → Settings → API).

**2. Supabase JWT secret** (required for the `/api/tv/*` endpoints):

```bash
dotnet user-secrets set "Supabase:JwtSecret" "<your-jwt-secret>" --project backend
```

Get it from Supabase Dashboard → Settings → JWT → Legacy JWT Secret. Run this in a normal (non-admin) terminal, since user-secrets are stored per user. Without it the backend starts fine and the portal works, but `/api/tv/*` returns 401 and a startup warning tells you what's missing.

**3. Supabase service-role key** (required for the portal's TV-link picker):

```bash
dotnet user-secrets set "Supabase:ServiceRoleKey" "<your-service-role-key>" --project backend
```

Get it from Supabase Dashboard → Settings → API → `service_role`. This is what `GET /api/patients/supabase-profiles` uses to search the `profiles` table on behalf of a signed-in nurse. It is deliberately server-side only and has **no anon-key fallback**: falling back would only work while `profiles` allowed anonymous SELECT, which is exactly the exposure the endpoint exists to remove. Treat it like a password — it bypasses RLS, so it must never reach the frontend or a committed file.

Without it the portal still works: the Supabase field in **Ny pasient** / the edit dialog degrades to manual UUID entry and says so.

**4. Run:**

```bash
dotnet run --project backend
```

- API: http://localhost:5084 and Swagger at http://localhost:5084/swagger
- SQLite database `backend/HomeCareDatabase.db` is created and migrated automatically
- Demo data (Section 4's accounts, all `Pass123!`) is seeded automatically, in Development only

**4. LAN profile** (for a TV on the same network instead of USB):

```bash
dotnet run --project backend --launch-profile http-lan
```

Then open the firewall (admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "ViKom backend dev 5084" `
  -Direction Inbound -Protocol TCP -LocalPort 5084 -Action Allow -Profile Private
```

### Frontend Setup (React)

```bash
cd ViKom/frontend
npm install
cp .env.example .env.local     # then fill in the two Supabase values
npm run dev                    # http://localhost:5173
```

The portal works without `.env.local`; only "Ring pasient" needs the Supabase values. `npm run build` produces `dist/`, and `npm run lint` runs ESLint. There is no `npm test` since no frontend tests exist yet.

### TV App Setup (Android)

1. Open `vikom-tv-app` in Android Studio
2. `cp local.properties.example local.properties` and fill in:

```properties
sdk.dir=C:\path\to\android\sdk          # usually auto-filled by Android Studio

supabase.url=https://your-project.supabase.co
supabase.key=your-anon-key-here

# Backend address AS SEEN FROM THE DEVICE:
backend.base.url=http://127.0.0.1:5084/   # USB device + adb reverse (recommended)
# backend.base.url=http://10.0.2.2:5084/  # Android emulator
# backend.base.url=http://192.168.1.XX:5084/  # physical device on LAN (use http-lan profile)
```

3. If using USB: `adb reverse tcp:5084 tcp:5084` (repeat after replugging)
4. Optional, for push notifications: place `google-services.json` from the Firebase Console in `app/`. Without it the app builds and runs; FCM is simply inactive.
5. Run from Android Studio, or `./gradlew installDebug`

### Supabase Configuration Checklist (for a fresh Supabase project)

- [ ] Create the project; note URL + anon key
- [ ] Create tables `profiles`, `contacts`, `call_history`, `quick_dial` (schema below)
- [ ] Add `fcm_token TEXT` to `profiles`
- [ ] (Optional, for FCM) create Edge Function `send-call-notification`
- [ ] Put URL + anon key into: backend `appsettings.Development.json`, frontend `.env.local`, TV `local.properties`
- [ ] Set the backend user-secret `Supabase:JwtSecret`
- [ ] Set the backend user-secret `Supabase:ServiceRoleKey` (powers the portal's TV-link picker; without it the field falls back to manual UUID entry)
- [ ] Create patient auth users in Supabase, then link each one to a backend patient from the portal (**Pasienter → Ny pasient**, or the Supabase field in the edit dialog). The seeder covers the demo patients.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  contact_id INTEGER,
  fcm_token TEXT,
  -- Presence columns. PresenceRepository and SignalingManager in the TV app read
  -- and write these, and the portal's TV-link picker shows device_type/is_online.
  device_type TEXT,
  is_online BOOLEAN DEFAULT false,
  webrtc_status TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS on profiles does NOT need to allow anonymous SELECT. The portal reads this
-- table only through the backend (GET /api/patients/supabase-profiles), which is
-- Personnel-only and uses the service-role key server-side; the service role
-- bypasses RLS entirely. Every TV-app profile read runs after sign-in
-- (AuthRepository.ensureProfileExists is called from signIn, and everything in
-- PresenceRepository/ContactRepository/ProfileRepository is a post-login
-- feature), so an authenticated-only policy is enough:
--
--   CREATE POLICY "profiles readable by authenticated"
--     ON profiles FOR SELECT TO authenticated USING (true);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  contact_id INTEGER,
  email TEXT,
  notes TEXT,
  name TEXT
);

CREATE TABLE call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES profiles(id),
  to_user_id UUID REFERENCES profiles(id),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status TEXT
);

CREATE TABLE quick_dial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  contact_id INTEGER,
  call_count INTEGER DEFAULT 0
);
```

## 11. Running and Testing

### End-to-End Smoke Test

Start the backend (5084), the frontend (5173), and the TV app.

**1. Portal flow:**
- Log in at http://localhost:5173 as `nurse@homecare.local` / `Pass123!`
- Check the dashboard renders, then open Appointments and create an appointment for Ingrid Berg in a free slot with a task list

**2. TV flow:**
- Log in on the TV app as `ingrid.berg@example.com` / `Pass123!`
- The home screen should greet Ingrid by name (that's `/api/tv/me` working) and show the next visit
- Open Appointments. The new appointment should appear, fetched from `/api/tv/appointments/mine`. Re-enter the screen to refresh; don't expect a realtime push (see Section 5).
- Open Care team. Nurse Nora should be listed (that's `/api/tv/careteam/mine`).

**3. Call signaling flow:**
- On the portal, open Ingrid's patient page → "Ring pasient"
- The TV shows the incoming-call screen; Accept
- The portal's call modal leaves "Ringer…", which confirms the signaling round-trip
- Don't expect audio; media is not implemented on the web side (Section 6)

**4. Visit flow:**
- On the portal, start the visit (Besøk) for the appointment: check the timer, complete a task, skip one with a reason, type notes (autosaves), log a call attempt, then Complete

### Automated Tests

Backend (the only automated tests in the project):

```bash
dotnet test
```

- `AppointmentRealtimePayloadTests`: pins the realtime payload/wrapper shape (the TV contract)
- `AppointmentStatusResolverTests`: the display-status rule
- `SupabaseAuthenticationTests`: Supabase JWT validation rules
- `UserRepositorySupabaseLookupTests`: patient lookup by Supabase UUID

Frontend: none (no test runner configured). TV app: none (`app/src` has no `test/` or `androidTest/` directories, although the test dependencies are declared). Adding tests in both is on the task list (Section 15).

## 12. Current Implementation Status

Statuses below were verified against the code. See the intro for what 🟢 🟡 🚧 mean.

| Feature | Status | Notes |
|---------|--------|-------|
| Web portal login/register | 🟢 | ASP.NET Identity + JWT; portal is personnel-only (patients get 403) |
| Appointment CRUD (web) | 🟢 | Create/update/soft-cancel, slot validation, status transitions |
| Availability slots + recurring windows | 🟢 | Calendar with weekly and daily views |
| Patient roster & clinical profiles | 🟢 | Diagnoses, medications, treatment plan, notes, next-of-kin, GP |
| Visit execution (_Besøk_) | 🟢 | Timer, task checklist, autosaving notes, call attempts, outcomes |
| Personnel dashboard | 🟢 | Stat tiles, month calendar, today's timeline (listed as planned in older docs) |
| TV app login | 🟢 | Supabase Auth, email verification, encrypted session, auto-refresh |
| TV appointment fetching + display | 🟢 | `/api/tv/appointments/mine`, day-grouped list, home hero card |
| TV patient name + care team | 🟢 | `/api/tv/me`, `/api/tv/careteam/mine` (new since the previous handoff) |
| Call signaling round-trip | 🟢 | Verified end-to-end web ↔ TV (offer → incoming screen → answer) |
| Call media (real audio) | 🚧 | TV WebRTC stack ready; web side sends dummy SDP, no audio yet |
| Realtime appointment push to TV | 🟡 | Emitter + listener + matching contract exist; delivery unverified, transport URL suspect (Section 5) |
| Incoming-call push (FCM, app closed) | 🟡 | Code wired on TV; needs google-services.json + end-to-end verification |
| Presence (online/offline) | 🟡 | 30s heartbeat + contact-detail indicator; contains a hardcoded demo allowlist (Section 13) |
| Patient contacts on TV | 🟢 | From Supabase; quick-dial folded into the contacts screen |
| Leadership analytics, route optimization | 🚧 | Not started |
| Automated tests | 🟡 | Backend only (4 test classes); zero frontend/TV tests |

## 13. Known Risks and Important Notes

### Configuration & Secrets

- The Supabase JWT secret lives in .NET user-secrets. On a new machine (or if secrets are wiped), `/api/tv/*` returns 401 until it's set again. The startup log tells you.
- Frontend `.env.local`: missing Supabase config silently disables calling (the portal otherwise works).
- TV `local.properties` is per-developer and not committed. A blank `backend.base.url` builds fine, but the appointments screen will report the backend as unreachable.
- The backend's portal JWT signing key (`Jwt:Key`) is committed in `appsettings.json`. Acceptable for a dev prototype; move it to secrets before any real deployment.

### Prototype shortcuts to revisit before real use

1. **Shared signaling channel, client-side filtering.** Everyone subscribes to the single `webrtc-signaling` channel and clients discard messages addressed to others. Any subscriber can technically see every user's call offers and appointment events. Acceptable for a demo, a privacy problem for real patient data. Per-user channels or Realtime authorization would fix it.
2. **Suspect realtime broadcast URL, swallowed errors.** See Section 5. The backend's broadcast POST likely targets a non-existent Supabase route, and all failures are reduced to a log warning. Check the backend logs and the Supabase dashboard before trusting any assumption that an event was sent.
3. **Public TURN relay with hardcoded credentials** (`openrelay.metered.ca` in `WebRTCConfig.kt`). Free community infrastructure, unsuitable for production and for patient traffic.
4. **Hardcoded "always online" allowlist.** `PresenceRepository.kt` contains `ALWAYS_ONLINE_CONTACT_IDS`, three contact ids forced to display as online for demos. Remove before trusting presence.
5. **Hardcoded frontend `API_URL`** and no global 401 handling (Section 9).
6. **Release-readiness gaps in the TV app:** application id is still `com.example.tv_caller_app`, minification is disabled for release, and the encrypted-storage library is an alpha version.
7. **Availability week/day endpoints return exception stack traces in 500 responses.** Don't let those leak beyond dev.
8. **Duplicate availability slots are swept up at startup instead of prevented.** `AvailabilityService.CreateAsync` inserts a slot without checking whether one already exists at that personnel/date/start time, and `UpdateWindowAsync` only compares new slots against *booked* ones, so re-saving a window can add a second free slot. `DBInit.RemoveDuplicateSlotDataAsync` cleans up on every boot — and it can delete an appointment while doing so. The fix is a uniqueness rule on (`PersonnelId`, `Date`, `StartTime`) plus a service that respects it; then the startup sweep can go.

### Debugging tips

- TV shows no appointments: almost always the 404 from `TvControllerBase`, meaning the signed-in Supabase account's UUID isn't on any backend patient (`SupabaseProfileId`). Check the backend DB.
- Incoming call never appears on TV: watch Logcat with tag `SignalingManager`. You should see a "Subscribed" line at startup and a "Raw broadcast received" line when the nurse rings. If the message arrives but nothing happens, suspect payload deserialization; the `call_offer` contract requires every field, including `callerUsername` (Section 6).
- Silent calls (once web media exists): check microphone availability and mode on the TV (`RECEIVE_ONLY` is expected without a mic) and the `DEBUG_DISABLE_AUDIO` flag in `WebRTCManager.kt` (must be `false`).
- Backend logs are quiet about realtime failures by design. Look for the warning-level "appointment event" messages.

### Limited Test Coverage

Only the backend has automated tests, and only for four focused areas. Everything else is manually tested. Treat the smoke test in Section 11 as the regression suite for now, and add real tests as you touch code.

## 14. Where to Start

### I want to understand…

**Authentication (web portal)**
- [backend/Controllers/AuthController.cs](backend/Controllers/AuthController.cs): login/register/JWT generation
- [frontend/src/auth/AuthService.ts](frontend/src/auth/AuthService.ts): frontend calls + localStorage
- [frontend/src/auth/guards/PersonnelOnlyRoute.tsx](frontend/src/auth/guards/PersonnelOnlyRoute.tsx): route protection

**Authentication (TV app + backend validation)**
- `auth/SessionManager.kt`: encrypted token storage
- `repository/AuthRepository.kt`: Supabase Auth calls (this one lives in `repository/`, unlike the session classes)
- [backend/Services/SupabaseAuthentication.cs](backend/Services/SupabaseAuthentication.cs): how the backend validates Supabase tokens
- [backend/Controllers/TvControllerBase.cs](backend/Controllers/TvControllerBase.cs): how a token becomes a backend patient

**Appointments (backend)**
- [backend/Models/Appointment.cs](backend/Models/Appointment.cs) → [backend/Services/AppointmentService.cs](backend/Services/AppointmentService.cs) → [backend/Controllers/AppointmentsController.cs](backend/Controllers/AppointmentsController.cs) → [backend/Controllers/TvAppointmentsController.cs](backend/Controllers/TvAppointmentsController.cs)

**Appointments (web UI)**
- [frontend/src/appointments/pages/AppointmentListPage.tsx](frontend/src/appointments/pages/AppointmentListPage.tsx) + [frontend/src/appointments/services/AppointmentService.ts](frontend/src/appointments/services/AppointmentService.ts)

**Appointments (TV UI)**
- `ui/fragments/AppointmentListFragment.kt` → `viewmodel/AppointmentsViewModel.kt` → `repository/AppointmentRepository.kt` → `network/BackendGet.kt`

**The visit workspace (Besøk)**
- [frontend/src/visits/VisitExecutionPage.tsx](frontend/src/visits/VisitExecutionPage.tsx) + [backend/Services/VisitService.cs](backend/Services/VisitService.cs)

**Call signaling**
- [frontend/src/services/SupabaseSignalingService.ts](frontend/src/services/SupabaseSignalingService.ts) + [frontend/src/components/common/CallModal.tsx](frontend/src/components/common/CallModal.tsx) (web)
- `calling/signaling/SignalingManager.kt` + `calling/signaling/SignalingMessage.kt` (TV; the wire contract lives here)

**WebRTC media (TV side)**
- `calling/webrtc/WebRTCManager.kt` (peer connection), `calling/webrtc/WebRTCConfig.kt` (STUN/TURN), `calling/audio/AudioDeviceDetector.kt` (mic detection)

**Realtime appointment events**
- [backend/Services/AppointmentRealtimeEventService.cs](backend/Services/AppointmentRealtimeEventService.cs) (payload) → the emit method in [backend/Services/AppointmentService.cs](backend/Services/AppointmentService.cs) (transport) → `SignalingManager.kt` `appointment_event` branch → `ui/activities/AppointmentActivity.kt`

**Background call listening**
- `calling/service/SignalingForegroundService.kt` + `calling/service/CallNotificationManager.kt`

**Backend database**
- [backend/DAL/ApplicationDbContext.cs](backend/DAL/ApplicationDbContext.cs) (entities), [backend/DAL/DBInit.cs](backend/DAL/DBInit.cs) (migrations + seeding), [backend/Models/](backend/Models/)

**Web portal UI conventions**
- [frontend/src/App.tsx](frontend/src/App.tsx) (routes), [frontend/src/design-system.md](frontend/src/design-system.md) (design system), [frontend/src/components/common/](frontend/src/components/common/) (reusable components), [frontend/src/layouts/](frontend/src/layouts/) (nav + sidebar)

**TV app UI**
- `TVCallerApplication.kt` (lifecycle) → `ui/activities/MainActivity.kt` → `ui/fragments/HomeFragment.kt` and siblings; `app/src/main/AndroidManifest.xml` for permissions and services

## 15. Next Steps for the Student Team

### Week 1: Onboarding

1. Clone both repositories and follow Section 10 until backend (5084), frontend (5173), and TV app all run
2. Run the full smoke test in Section 11. It exercises every working feature in about 15 minutes.
3. Read [`municipal-homecare-research-report.md`](municipal-homecare-research-report.md) for the product context (why homecare, why a TV, why exceptions matter)
4. Skim [frontend/src/design-system.md](frontend/src/design-system.md) before touching any web UI

### Week 2: Deep Dive

1. Trace a login on both web and TV, including how a Supabase token becomes a backend patient (Section 4)
2. Trace an appointment from creation on the web to display on the TV
3. Trace a call: watch the browser console and TV Logcat (`SignalingManager` tag) while ringing
4. Review the database models and the seeded data in [backend/DAL/DBInit.cs](backend/DAL/DBInit.cs)

### Candidate first tasks (roughly in value order)

1. **Verify/fix the realtime appointment broadcast.** Correct the backend's Supabase broadcast request (Section 5), then prove an event arrives on the TV and launches `AppointmentActivity`. Small, well-scoped, touches both repos, and unlocks the instant TV notification.
2. **Implement real web-side call media.** Add `RTCPeerConnection` + `getUserMedia` in the frontend, replace the dummy SDP, and exchange ICE candidates over the existing channel. The TV side is already waiting. This completes the calling feature.
3. **Verify FCM closed-app call delivery** with a real `google-services.json` and the `send-call-notification` Edge Function.
4. **Add tests** where you work: frontend (Vitest + Testing Library) and TV (JUnit against the ViewModels via the datasource interfaces; they were designed for faking).
5. **Quality-of-life cleanups:** env-configurable `API_URL`, global 401 → login redirect, remove the presence allowlist, per-user signaling channels.

### Working agreements (what the previous team followed)

- The backend stays the source of truth for healthcare data; Supabase stays identity + realtime only. Never duplicate patient data into Supabase.
- Before changing anything shared (profiles, appointments, auth, calls): identify all consumers and keep web + TV compatible. The signaling and realtime payload contracts must change on both sides at once.
- Don't mark 🟡/🚧 features as 🟢. Update Section 12 when a status changes, and note what was verified.

### Code Review Checklist

- [ ] No secrets committed (Supabase keys stay in `.env.local` / user-secrets / `local.properties`)
- [ ] New backend endpoints appear in Swagger and use the right auth scheme (`Personnel` vs `SupabaseJwt`)
- [ ] TV requests to `/api/tv/*` go through `BackendGet.kt`
- [ ] Signaling/realtime contract changes are made on both sides and covered by the payload test
- [ ] Database changes come with an EF migration
- [ ] New UI uses the design system (web) or the existing styles and string resources (TV, Norwegian + English)

## Appendix: Quick Reference

### Configuration

| What | Where | Keys |
|------|-------|------|
| Backend Supabase project | `backend/appsettings.Development.json` | `Supabase:Url`, `Supabase:AnonKey` |
| Backend Supabase JWT secret | .NET user-secrets | `Supabase:JwtSecret` |
| Backend Supabase service-role key | .NET user-secrets | `Supabase:ServiceRoleKey` |
| Backend portal JWT | `backend/appsettings.json` | `Jwt:Key`, `Jwt:Issuer`, `Jwt:Audience` |
| Frontend Supabase | `frontend/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Frontend backend URL | `frontend/src/config/config.ts` | `API_URL` (hardcoded) |
| TV app | `local.properties` | `supabase.url`, `supabase.key`, `backend.base.url` |

### Common Ports

| Service | Port / command |
|---------|----------------|
| Backend API + Swagger | http://localhost:5084 (`/swagger`) |
| Frontend dev server | http://localhost:5173 |
| TV over USB | `adb reverse tcp:5084 tcp:5084` |

### Demo Accounts (Development seed, all `Pass123!`)

| Where | Account |
|-------|---------|
| Portal (nurse) | `nurse@homecare.local` |
| Backend patients | `patient.ingrid@homecare.local` (Ingrid, has the seeded appointments), `patient.wayki@homecare.local` (Wayki, no appointments by design) |
| TV login (Supabase) | `ingrid.berg@example.com` (the only patient with a working TV login) |

### Key Endpoints

- Personnel login: `POST /api/auth/login`
- Create appointment: `POST /api/appointments`
- Start visit: `POST /api/visits/start`
- TV appointments: `GET /api/tv/appointments/mine` (Supabase auth)
- TV profile / care team: `GET /api/tv/me`, `GET /api/tv/careteam/mine` (Supabase auth)
- Patient clinical data: `GET /api/patients/{id}`

### Useful Commands

```bash
# Backend
dotnet run --project backend
dotnet run --project backend --launch-profile http-lan
dotnet user-secrets set "Supabase:JwtSecret" "..." --project backend
dotnet test

# Frontend
npm run dev
npm run build
npm run lint

# TV app
adb reverse tcp:5084 tcp:5084
./gradlew installDebug
```

**Document Version:** 2.0

**Last Updated:** August 2026

**Revision note (v2.0):** Full fact-check of every section against both codebases at commit `803034e` (ViKom) / `47f90fb` (vikom-tv-app). Corrected the calling status (signaling verified, media not implemented web-side), the realtime appointment description (both ends wired, delivery unverified), the backend controller and endpoint tables (removed non-existent controllers, added the new `/api/tv/me` and `/api/tv/careteam/mine` endpoints), the TV app structure (post-redesign screens, correct repo name), model field lists, and the seeded demo data.

**For Questions:** the file paths and class names in this guide point to the source of truth. Read the code they name.
