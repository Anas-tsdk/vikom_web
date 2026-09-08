# ViKom - Homecare Management

ViKom is a homecare system split across two applications:

- **This repo** - the web portal used by healthcare personnel (React frontend + ASP.NET Core Web API), and the backend that both applications share.
- **[vikom-tv-app](https://github.com/Rahemb/vikom-tv-app)** - an Android app used by patients on a TV or tablet, for receiving calls from their caregiver and for viewing their appointments and care team.

The backend is the system of record for all clinical data. Supabase is used alongside it for patient identity on the TV app and as a realtime event bus between the two.

New to the project? Start with **[HANDOFF.md](HANDOFF.md)**. It covers the architecture, both codebases, setup, and the status of every feature.

## Prerequisites

- .NET 8.0 SDK
- Node.js v22 or later
- A Supabase project (only needed for the calling feature and the TV app endpoints)

## Project Structure

- **backend/** - ASP.NET Core Web API with SQLite database
- **backend.Tests/** - xUnit test project
- **frontend/** - React + TypeScript + Vite application

## Installation & Setup

### 1. Clone and navigate

```bash
git clone <repository-url>
cd ViKom
```

### 2. Backend setup

```bash
dotnet restore
dotnet run --project backend
```

The API starts at **http://localhost:5084**, with Swagger at **http://localhost:5084/swagger**.

The SQLite database is created and seeded automatically on first run in Development.

#### Supabase secret (only needed for the TV app's endpoints)

`/api/tv/*` authenticates access tokens issued by Supabase Auth, so it needs the project's JWT secret. Unlike the anon key this is a real secret, so it is kept in .NET user secrets rather than in `appsettings*.json`, which are committed:

```bash
dotnet user-secrets set "Supabase:JwtSecret" "<Supabase dashboard: Settings > JWT Keys > Legacy JWT Secret>" --project backend
```

Run this in a **normal** terminal, not an elevated one: user secrets are stored per Windows user, so an admin shell writes them somewhere the app will not look.

Without the secret the app still starts and the web portal works normally. Only `/api/tv/*` returns 401, and a warning is logged at startup saying so.

#### Letting the TV app reach the backend

The simplest option for a tablet connected by USB needs nothing here at all. Forward the port down the cable instead:

```bash
adb reverse tcp:5084 tcp:5084
```

The device can then reach the backend on `127.0.0.1:5084` regardless of which network it is on, with no firewall changes. See the TV app's `local.properties.example`.

Over the LAN instead, the default profiles bind to `localhost`, which a physical tablet cannot reach. The `http-lan` profile binds all interfaces:

```bash
dotnet run --project backend --launch-profile http-lan
```

You will also need an inbound firewall rule for TCP 5084 on your private network (Windows requires an administrator terminal for this):

```powershell
New-NetFirewallRule -DisplayName "ViKom backend dev 5084" -Direction Inbound -Protocol TCP -LocalPort 5084 -Action Allow -Profile Private
```

To check it works, open `http://<your-lan-ip>:5084/swagger` in the tablet's own browser. HTTPS redirection is disabled in Development so the device can use plain HTTP; production re-enables it automatically.

### 3. Frontend setup

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

These are only used by the "Ring pasient" call feature. The portal runs without them, but the call button will report that Supabase is not configured.

```bash
npm run dev
```

The frontend starts at **http://localhost:5173**. In Development the backend accepts any loopback origin, so Vite picking a different port when 5173 is taken will not break CORS.

## Running the Application

1. Start the backend (`dotnet run --project backend`)
2. In a separate terminal, start the frontend (`npm run dev` from `frontend/`)
3. Open **http://localhost:5173**

## Everyday Commands

### Is the backend actually running?

`dotnet run` holds the terminal open for as long as the API is alive, so closing that terminal, or a Ctrl+C you forgot about, stops it. From another terminal:

```bash
curl http://localhost:5084/swagger/index.html
```

A `200` means it is up and healthy. To see the same thing without curl, on Windows:

```powershell
netstat -ano | findstr :5084
```

One or more `LISTENING` lines means it is running; no output at all means it is not, and the last number on each line is the process ID if you need to kill it. Note that a `dotnet.exe` in Task Manager is **not** proof the API is up — MSBuild and the VS Code C# extension both run under that name too. The port is the reliable signal.

### "Address already in use" on port 5084

```
System.IO.IOException: Failed to bind to address http://127.0.0.1:5084: address already in use.
```

This is almost never another program stealing the port. It is an earlier `backend.exe` that is still
alive: `dotnet run` launches the API as a child process, and closing the terminal or stopping the run
from the IDE does not always take that child down with it. It keeps holding the port until you kill it.

Find out what is holding the port, in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 5084 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Get-Process -Id $_.OwningProcess } |
  Select-Object -Unique Id, ProcessName, StartTime, Path
```

Check the output before killing anything. `ProcessName` should be `backend` and `Path` should point
into this repo's `backend/bin/`; `StartTime` tells you how long the stale one has been sitting there.
If it is something else, that is a different problem and killing it will not help.

Then stop it by its process ID:

```powershell
Stop-Process -Id <pid> -Force
```

Or, once you trust it is ours, find and kill in one step:

```powershell
Get-NetTCPConnection -LocalPort 5084 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

Verify the port is free again. `-ErrorAction SilentlyContinue` is what keeps the "no matching
objects" complaint quiet when nothing is listening, so here an empty result is the good outcome:

```powershell
Get-NetTCPConnection -LocalPort 5084 -State Listen -ErrorAction SilentlyContinue
```

The same works in an old-style `cmd` shell, where the process ID is the last column:

```
netstat -ano | findstr :5084
taskkill /PID <pid> /F
```

Swap `5084` for `5173` to do the same for a stuck Vite dev server. Do not go hunting for
`dotnet.exe` in Task Manager and kill whatever you find — MSBuild and the VS Code C# extension run
under that name too, and the running API is `backend.exe`, not `dotnet.exe`.

### Common failures, in the order worth checking

The frontend showing no data and the TV app showing no data have different likely causes, but both look the same from the outside.

- **The backend exits at startup with "address already in use"** — an older `backend.exe` is still
  holding port 5084. See the section just above.
- **Nothing on port 5084** — the backend is not running. Start it. This is far more common than a genuine hang.
- **Port 5084 is listening, but the TV app still shows nothing** — the API is fine and the problem is between the device and your machine. See [Everyday Commands in the TV app README](https://github.com/Rahemb/vikom-tv-app#everyday-commands); usually the `adb reverse` tunnel has been dropped.
- **`/api/tv/*` returns 401 while the portal works normally** — the Supabase JWT secret is missing. See the user-secrets step above. A warning is logged at startup when this is the case.
- **The portal loads but every request fails** — check the frontend is pointed at the right port, and look for CORS errors in the browser console.

### Changing the database: migrations vs. the seeder

Two different jobs, two different homes. Getting this wrong is the most common way our seeder has rotted, so the rule is worth stating plainly:

| | Migration | Seeder (`DBInit.SeedAsync`) |
| --- | --- | --- |
| Answers | "how do we get from the old state to the new one?" | "what should exist in a dev database?" |
| Runs | once per database, ever | on every backend startup |
| Recorded in | `__EFMigrationsHistory` | nowhere |
| Belongs there | schema changes, and one-time data fixes | demo accounts, demo appointments, demo clinical data |

**The seeder describes the desired state and nothing else.** Every line in it should still make sense on a database created five minutes ago. It must be idempotent: running it ten times in a row leaves the same result as running it once.

**One-time fixes go in a migration, even when they only touch data.** This is the part that is easy to get wrong. Deleting a demo patient from the seeder stops *new* databases from getting them, but the row survives in every database that already exists — and ours are local SQLite files that are gitignored and never re-created. The temptation is to add a "clean this up on startup" step to the seeder. Don't: it turns a one-off transition into code that runs forever, and a year later nobody can tell whether it is load-bearing or archaeology.

Instead, generate an empty migration and write the SQL yourself:

```bash
dotnet ef migrations add RemoveSomeDemoPatient --project backend
```

The model has not changed, so EF produces an empty `Up`/`Down` and leaves `ApplicationDbContextModelSnapshot.cs` untouched. Fill in `Up` with `migrationBuilder.Sql(...)`, ordering the statements by foreign key. [`20260820142447_RemoveErikDemoPatient.cs`](backend/Migrations/20260820142447_RemoveErikDemoPatient.cs) is a worked example. Leave `Down` empty with a comment when the change cannot be undone — deleted demo data usually cannot be.

A useful test: **if a line in the seeder mentions something that no longer exists, it is in the wrong file.** A name in a migration is history and reads as history. The same name in the seeder just looks like a mistake.

Two things this rule does not cover:

- **Schema drift.** Never hand-roll `ALTER TABLE` at startup to add a column. That is what migrations are for, and a startup patch will silently diverge from the model.
- **Workarounds for live bugs.** `RemoveDuplicateSlotDataAsync` runs at every startup and looks like legacy cleanup, but it is not: `AvailabilityService` can still create duplicate slots, so it is compensating for a bug that has not been fixed. That is a legitimate reason to run something on every startup, but say so in a comment, because the next reader will assume it is dead code and delete it.

### Resetting or reseeding the database

In `Development`, `DBInit.SeedAsync` runs on every backend startup. It applies pending migrations and then seeds missing demo data. No separate database setup or seed command is required.

#### Why we seed demo data

The seed data gives developers a predictable starting point for local development and testing. It provides ready-to-use accounts, availability, appointments, and visits without requiring manual setup.

Reset or reseed the database when you need to:

- Return the application to a known test state
- Restore demo data after changing or deleting it while testing the running web app
- Verify database migrations against a clean database
- Reproduce bugs without keeping data from earlier tests

For example, you might create, edit, or delete appointments while testing a new feature. Resetting the database removes those changes and restores the original seeded state, ready for another test run.

The seed guards prevent normal backend restarts from overwriting data created during development.

#### What is seeded on startup

The seed behavior depends on which tables already contain data:

| Data                                | Seed behavior                                   |
| ----------------------------------- | ----------------------------------------------- |
| Roles and demo accounts             | Created or repaired on every startup            |
| Availability                        | Seeded only when `AvailabilityWindows` is empty |
| Appointments, visits, and call logs | Seeded only when `Appointments` is empty        |

This means deleting only some demo appointments will **not** restore them. If even one appointment remains, the entire appointment seed is skipped.

> Stop the backend before modifying the database. On Windows, the running backend locks the database files.

#### Full reset

A full reset deletes the local SQLite database and all local test data. The next backend startup recreates the database, applies migrations, and restores the demo data.

Bash:

```bash
rm backend/HomeCareDatabase.db*
dotnet run --project backend
```

PowerShell:

```Powershell
Remove-Item backend/HomeCareDatabase.db*
dotnet run --project backend
```

The `*` also removes the related `-wal` and `-shm` files. Do not leave these files behind.
After the reset, the database contains:

- The demo nurse and patients
- About one week of nurse availability
- Completed physical and digital visits
- Answered and unanswered call attempts
- An incomplete digital visit

A full reset deletes all local data you created while testing.

#### Reseed appointments and visits only

Use this when you want to restore the demo appointments without resetting accounts or other local data:

```bash
sqlite3 backend/HomeCareDatabase.db "DELETE FROM VisitTasks; DELETE FROM CallLogs; DELETE FROM Visits; DELETE FROM Appointments;"
dotnet run --project backend
```

The tables must be cleared in this order because the child records reference their parent records.
To also reseed the nurse’s availability, include:

```SQL
DELETE FROM Availabilities;
DELETE FROM AvailabilityWindows;
```

This method requires the `sqlite3` command-line tool. If it is unavailable, use a full reset.

#### Inspect the current data

```bash
sqlite3 backend/HomeCareDatabase.db "SELECT 'Appointments', COUNT(*) FROM Appointments UNION ALL SELECT 'Visits', COUNT(*) FROM Visits UNION ALL SELECT 'CallLogs', COUNT(*) FROM CallLogs UNION ALL SELECT 'Users', COUNT(*) FROM AspNetUsers;"
sqlite3 backend/HomeCareDatabase.db "SELECT UserName, Role FROM AspNetUsers;"
```

#### Use a temporary database

Override the connection string to test with a separate database:

```bash
ConnectionStrings__ApplicationDbConnection="Data Source=C:/temp/Test.db" dotnet run --project backend
```

PowerShell:
```Powershell
$env:ConnectionStrings__ApplicationDbConnection = 'Data Source=C:\temp\Test.db'
dotnet run --project backend
```

The PowerShell override remains active for that terminal session. Remove it when finished:

```Powershell
Remove-Item Env:ConnectionStrings__ApplicationDbConnection
```

#### Data that is not reset

These commands affect only the local SQLite database. They do not delete Supabase accounts or profiles used by the TV app.
After a full reset, the seeder reconnects the demo patients to their existing Supabase profiles using SupabaseProfileId. Calling and TV endpoints should therefore continue working without reseeding Supabase.

## Default Accounts

Seeded automatically in Development. All use the password **Pass123!**

| Role      | Username                      | Notes                                                                                                                                                             |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personnel | nurse@homecare.local          | Nurse Nora - the main portal account                                                                                                                              |
| Patient   | patient.ingrid@homecare.local | Ingrid Berg - linked AND has a working TV login, so this is the one to use when testing the TV app. She owns all the seeded appointments and visits               |
| Patient   | patient.wayki@homecare.local  | Bong Wayki - the TV test patient. Linked to the Supabase profile `wayki`; starts with no appointments, so book one for him to see the TV appointment view fill in |

The web portal is personnel-only: the patient accounts above are kept because a patient _is_ a user row that appointments and visits point at, but they cannot log into the portal (login returns 403). Patients sign in on the TV app through Supabase instead.

Only patients with a `SupabaseProfileId` can be targeted with calls or realtime appointment events on a TV. Set it from the portal: **Pasienter → Ny pasient** registers a patient and links them, and the same Supabase field sits in the edit dialog for patients that already exist. Searching by the username shown in the TV app looks the profile up in Supabase, so you link an account that is confirmed to exist rather than a pasted UUID.

The portal links to Supabase accounts but never creates them: a patient's TV login is still made in the TV app (sign-up) or in the Supabase dashboard. Ingrid is the demo patient with a working one (`ingrid.berg@example.com` / `Pass123!`).

The profile search runs through the backend, not the browser, so it needs one extra secret:

```bash
dotnet user-secrets set "Supabase:ServiceRoleKey" "<service-role-key>" --project backend
```

Without it the portal still works — the Supabase field just degrades to manual UUID entry and tells you why. Keep that key server-side: it bypasses Supabase row-level security, so it must never end up in `.env.local` or a commit.

Linking changes only the patient's Supabase profile ID. It never touches their URL handle, so `/patients/ingrid.berg` keeps working across linking, relinking and unlinking. Patients registered in the portal have no handle and are addressed as `/patients/<guid>`.

## Testing

```bash
dotnet test backend.Tests/backend.Tests.csproj
```

## Technology Stack

### Backend

- ASP.NET Core 8.0 Web API
- Entity Framework Core with SQLite
- ASP.NET Core Identity
- JWT bearer authentication with two schemes: the portal's own tokens, and Supabase-issued tokens for the TV app

### Frontend

- React 19 + TypeScript
- Vite
- React Router
- Bootstrap 5 + Bootstrap Icons + React Bootstrap
- Supabase JS client (realtime signaling for calls)

## Features

- Role-based authentication (Patient, Personnel)
- Personnel availability management with weekly and daily calendar views
- Appointment booking and scheduling
- Visit ("Besøk") execution workspace with task tracking and visit records
- Call signaling from the portal to a patient's TV app (ring → incoming-call screen → answer/reject; verified end-to-end, though real audio/video media is not implemented yet)
- Realtime appointment events emitted toward the patient's TV app on create, update and cancel (both ends are wired, but delivery is not yet verified; see the hand-off guide)
- User-specific dashboards
- Responsive design for mobile and desktop
