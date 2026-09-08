# Municipal Homecare Nurse App — Architecture & Product Review

## Executive summary

The current prototype covers three useful surfaces — a patient list, a patient detail page, an appointments list, a visit execution workspace, and a route planner with a real map. That is a credible demo, but it is roughly 15–20% of what a municipal homecare nurse actually needs in a shift. To be genuinely usable in Norwegian municipal operations, the app must shift from "a few nice screens" to an operational layer that sits on top of the municipality's source-of-truth systems (EHR/journal, allocation decisions, medication list, rota) and optimises the nurse's minute-by-minute decisions: what to do next, with whom, where, with what risk, and how to document it without losing time.

## Main design direction

- Build the nurse app as a shift-centric operations cockpit, not a CRUD UI over patients. Everything should answer "what now?" first and "what about patient X?" second.
- Treat the visit as the atomic unit of work, with a strict lifecycle: planned → en route → arrived → in progress → documented → completed / deviated / cancelled, and a matching state machine in the backend.
- Design offline-first. Norwegian homecare runs in basements, lifts, rural roads, and old apartment blocks with no signal. Anything that requires connectivity at the door is a failed product.
- Optimise for cognitive load reduction, not feature count. A nurse arriving at door 9 of 14 should see ≤ 5 things on screen.

## Biggest workflow risks if ignored

- **Medication safety** — no double-signing, no allergy/interaction surfacing, no Multidose/eResept awareness → real patient harm.
- **Documentation drift** — if notes are not tied to a structured visit and synced to the journal, the municipality loses legal defensibility (helsepersonelloven §39–40).
- **Lone-worker safety** — no panic button, no "I have arrived/left" telemetry, no escalation path → liability and union pushback.
- **Route reality gap** — a planner that ignores time windows, key access, traffic, and reassignment mid-shift will be abandoned within a week.
- **Handover loss** — if the shift change does not transfer active concerns, not just notes, care continuity breaks.

## What the system should own

ViKom should own the **operational layer**:

- Shift plan
- Route
- Visit lifecycle
- Task execution
- In-visit checklists
- Deviations
- Lone-worker telemetry
- Intra-team messaging
- Handover state

## What the system should NOT own

These should be referenced or synchronised only:

- The patient journal of record: Gerica / Profil / CosDoc / DIPS / Helseplattformen. Vendor unspecified; do not assume one.
- The medication list: FEST / Reseptformidleren / Multidose authority. Sync read-only and write back structured events.
- Allocation decisions (vedtak) from the tildelingskontor. Reference only, never edited in-app.
- Identity. Should federate to municipal IdP, ID-porten / Feide / Entra ID, and never be a local user store for clinical staff.

## Assumptions and boundaries

### Explicit assumptions drawn from the research

- Service is delivered per municipal vedtak; tasks are derived from the decision, not invented by the nurse.
- Staff mix is heterogeneous: sykepleier, helsefagarbeider, assistant, vikar, student. Permissions must reflect competence and delegation, not just job title.
- A shift contains 8–20 visits with highly variable durations, usually 5–60 minutes in-home, plus travel, calls, and documentation overhead.
- Connectivity is unreliable in the field; documentation often happens between visits in the car.
- Norwegian language is the operational language. Bokmål should be default, while Nynorsk and Sámi support may be a municipal procurement requirement in several regions.
- GDPR, pasientjournalloven, and the norm for informasjonssikkerhet apply. Audit trail is non-negotiable.

### Unspecified — do not guess

- Which EHR/journal vendor the municipality uses. Architecture must be vendor-agnostic with an adapter layer.
- Whether the municipality uses Multidose, dosett, or manual dispensing. The medication module must handle all three.
- Whether private contracted providers operate alongside the municipal team. Multi-tenant scoping must be possible but not assumed.
- Exact integration surface: FHIR, proprietary REST, CSV exports, or other. This is unspecified.
- Whether nurses use shared devices or personal devices. This affects auth session length and biometric strategy.

## Recommended boundaries

| Concern                                   |   Owned by app |        Reference (read-only) | Synchronised (read + structured write-back) |
| ----------------------------------------- | -------------: | ---------------------------: | ------------------------------------------: |
| Shift plan & route                        |             ✅ |                              |                                             |
| Visit lifecycle & telemetry               |             ✅ |                              |                                             |
| In-visit tasks, checklists, deviations    |             ✅ |                              |                                             |
| Free-text & structured notes              | Drafted in-app |                              |                     Written back to journal |
| Medication list                           |                |         ✅ from FEST/journal |          Administration events written back |
| Vedtak / care plan                        |                |            ✅ from sak/arkiv |                                             |
| Allergies, diagnoses, kontaktpersoner     |                |              ✅ from journal |                                             |
| Identity & roles                          |                |        ✅ from municipal IdP |                                             |
| Lab results, hospital discharge summaries |                | ✅ via kjernejournal/journal |                                             |
| Messaging within team                     |             ✅ |                              |                                             |
| Messaging to GP / hospital                |                |                              |               Via Helsenett / dialogmelding |

### Sync model

Pull on shift start + delta on reconnect. Push events such as visit completed, medication given, and deviation logged as an append-only queue with idempotency keys. Never overwrite journal state; always write events.

## Target personas and jobs to be done

### Sykepleier (registered nurse) — primary

**Goals:** Deliver clinically safe care to 10–16 patients per shift; catch deterioration early; document defensibly; finish on time.

**Pain points:** Constantly switching between phone, paper printout, journal laptop, key cabinet, car GPS, and SMS. Double documentation. Unclear who did what on the previous shift.

**Decision points:** Re-prioritising the route after a delay; deciding whether to escalate to legevakt; whether to give a PRN dose; whether to skip a visit safely.

**Friction moments:** Door not opening, patient not home, key code changed, medication missing from dosett, family member present and asking questions.

**Success:** Finishes shift with all visits documented, no medication errors, and knows exactly what to hand over.

### Helsefagarbeider / assistant nurse — primary

**Goals:** Execute delegated tasks correctly; know the limits of competence; reach a sykepleier fast when in doubt.

**Pain points:** Tasks visible that they are not allowed to perform; unclear what to do if a patient seems worse.

**Success:** Clear "what I can do / what I must escalate" line; one-tap access to the on-shift RN.

### Vikar / student — secondary

**Goals:** Find the door, find the key, do the task, and not miss anything safety-critical.

**Success:** Onboarding flow that surfaces only what they are authorised to see; route with extra context such as parking, door codes, and dog in flat.

### Patient — indirect user

**Goals:** Know who is coming, roughly when, and recognise the person at the door.

**Friction:** Different face every day; nurses arriving outside the time window without notice.

**Success:** Predictable arrival window, name + photo of today's nurse, and a simple way to cancel/reschedule via family portal. Scope unspecified.

### Pårørende (family / relative) — secondary

**Goals:** Trust that care is happening; be informed of significant changes; reach the team.

**Success:** A read-only, consent-gated channel showing visit completion + a contact route. Not a clinical view.

### Avdelingsleder / fagansvarlig / koordinator — primary back-office

**Goals:** Staff the shift; balance load; respond to sick calls; review deviations; ensure vedtak compliance and hours.

**Pain points:** No live view of who is where; deviations buried in free text; rebalancing the board mid-day requires phone calls.

**Success:** Live shift board, drag-to-reassign, deviation queue with severity, KPI dashboard tied to vedtak.

### Tildelingskontor / saksbehandler — adjacent

Not a user of the nurse app. Should receive structured signals such as changed needs and escalations that prompt re-vurdering of the vedtak.
