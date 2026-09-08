using backend.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL
{
    public class DBInit
    {
        public static async Task SeedAsync(ApplicationDbContext context, UserManager<User> userManager, RoleManager<IdentityRole> roleManager)
        {
            // Schema changes belong to migrations, so let a failure here stop
            // startup instead of seeding on top of a database whose shape we
            // cannot vouch for.
            await context.Database.MigrateAsync();

            // Check if roles exist, if not create them
            if (!await roleManager.RoleExistsAsync("Personnel"))
            {
                await roleManager.CreateAsync(new IdentityRole("Personnel"));
            }

            if (!await roleManager.RoleExistsAsync("Patient"))
            {
                await roleManager.CreateAsync(new IdentityRole("Patient"));
            }

            // NOT a one-time cleanup: AvailabilityService can still produce
            // duplicate slots (see the note on RemoveDuplicateSlotDataAsync),
            // so this has to keep running until that is fixed properly.
            await RemoveDuplicateSlotDataAsync(context);

            // Ensure base personnel and a broader demo patient set always exist.
            await EnsureDemoUserAsync(
                userManager,
                userName: "nurse@homecare.local",
                email: "nurse@homecare.local",
                fullName: "Nurse Nora",
                role: "Personnel",
                phoneNumber: "+47 900 00 001",
                address: "Sognsveien 10, 0450 Oslo");

            // NOTE: The SupabaseProfileId values below are dev-only demo IDs that
            // match seeded profiles in our development Supabase project. They will
            // NOT resolve in other Supabase projects (staging/CI), where the
            // "Ring pasient" signaling link will silently fail until re-mapped.
            await EnsureDemoUserAsync(
                userManager,
                userName: "patient.ingrid@homecare.local",
                email: "patient.ingrid@homecare.local",
                fullName: "Ingrid Berg",
                role: "Patient",
                phoneNumber: "+47 900 00 104",
                address: "Grensen 12, 0159 Oslo",
                supabaseProfileId: "c9f53a55-1375-48e6-95ce-25917f55be2d");

            // Test patient for the TV app. The Supabase profile "wayki" already
            // exists in the dev project, so this row is what links it to the
            // backend and makes /api/tv/* resolve for that device.
            await EnsureDemoUserAsync(
                userManager,
                userName: "patient.wayki@homecare.local",
                email: "wayki@oslomet.no",
                fullName: "Bong Wayki",
                role: "Patient",
                phoneNumber: "+47 900 00 105",
                address: "Thorvald Meyers gate 33, 0555 Oslo",
                supabaseProfileId: "4fb30313-b8e6-4381-896c-d345b5d3bd72");

            // Link demo patients to the nurse so they appear in her patient list.
            await EnsurePatientPersonnelLinkAsync(context, userManager, "patient.ingrid@homecare.local", "nurse@homecare.local");
            await EnsurePatientPersonnelLinkAsync(context, userManager, "patient.wayki@homecare.local", "nurse@homecare.local");

            // Fill the read-only clinical profile (diagnoses, medications, etc.)
            // for the demo patients so the Besøk workspace has real data.
            await EnsurePatientClinicalDataAsync(context, userManager);

            // Seed availability windows if none exist (NEW SYSTEM)
            if (!context.AvailabilityWindows.Any())
            {
                var personnel = context.Users.FirstOrDefault(u => u.Role == "Personnel");
                if (personnel != null)
                {
                    var windows = new List<AvailabilityWindow>
                    {
                        new AvailabilityWindow
                        {
                            PersonnelId = personnel.Id,
                            Date = DateTime.Today.AddDays(1),
                            StartTime = new TimeSpan(9, 0, 0),
                            EndTime = new TimeSpan(17, 0, 0),
                            IsAvailable = true,
                            Notes = "Sone A, Hagegata 25, 0653 Oslo"
                        },
                        new AvailabilityWindow
                        {
                            PersonnelId = personnel.Id,
                            Date = DateTime.Today.AddDays(2),
                            StartTime = new TimeSpan(9, 0, 0),
                            EndTime = new TimeSpan(17, 0, 0),
                            IsAvailable = true,
                            Notes = "Sone A, Rolf Hofmos gate 18, 0655 Oslo"
                        },
                        new AvailabilityWindow
                        {
                            PersonnelId = personnel.Id,
                            Date = DateTime.Today.AddDays(3),
                            StartTime = new TimeSpan(0, 0, 0),
                            EndTime = new TimeSpan(0, 0, 0),
                            IsAvailable = false,
                            Notes = "Day off"
                        }
                    };

                    context.AvailabilityWindows.AddRange(windows);
                    await context.SaveChangesAsync();

                    // Generate slots for each window
                    foreach (var window in windows)
                    {
                        var slots = GenerateSlots(window);
                        context.Availabilities.AddRange(slots);
                    }
                    await context.SaveChangesAsync();

                    // Appointments themselves are seeded by the canonical demo
                    // set below (SeedDemoAppointmentsAndVisitsAsync) so the data
                    // stays small and consistent with the visit architecture.
                }
            }

            // Enforce the upcoming 7-day availability pattern used by the dashboard module.
            await EnsureUpcomingWeekAvailabilityPatternAsync(context);

            // Seed the canonical demo set: exactly 5 appointments (2 planned +
            // 3 completed), where the completed ones carry real Visit records.
            // They all belong to Ingrid; Wayki is left without appointments on
            // purpose, so the TV app can be tested from an empty schedule.
            await SeedDemoAppointmentsAndVisitsAsync(context);
        }

        /// <summary>
        /// Fills the read-only clinical profile for the demo patients (only when
        /// not already set, so it never clobbers later edits). Ingrid matches the
        /// visit-execution design; Wayki gets a plausible placeholder.
        /// </summary>
        private static async Task EnsurePatientClinicalDataAsync(ApplicationDbContext context, UserManager<User> userManager)
        {
            async Task SeedAsync(
                string userName,
                string profileUsername,
                DateTime dob,
                string kinName,
                string kinRelation,
                string gp,
                string allergies,
                string diagnoses,
                string conditionFlags,
                string treatmentPlan,
                (string Name, string Dosage, string Schedule)[] medications)
            {
                var patient = await userManager.FindByNameAsync(userName);
                if (patient == null) return;

                // Readable URL handle. Purely local — it is what /patients/:username
                // resolves against, and is deliberately NOT the Supabase username.
                // IX_AspNetUsers_ProfileUsername is unique, so check the handle is
                // free before claiming it: a collision would throw and take startup
                // down with it.
                if (string.IsNullOrEmpty(patient.ProfileUsername))
                {
                    var handleOwner = await userManager.Users
                        .FirstOrDefaultAsync(u => u.ProfileUsername == profileUsername);

                    if (handleOwner != null)
                    {
                        Console.WriteLine(
                            $"Seeder: URL handle '{profileUsername}' is already used by " +
                            $"'{handleOwner.UserName}', so '{userName}' keeps the GUID in its URL.");
                    }
                    else
                    {
                        patient.ProfileUsername = profileUsername;
                        await userManager.UpdateAsync(patient);
                    }
                }

                // Treat a null DateOfBirth as "clinical data not seeded yet".
                if (patient.DateOfBirth == null)
                {
                    patient.DateOfBirth = dob;
                    patient.NextOfKinName = kinName;
                    patient.NextOfKinRelation = kinRelation;
                    patient.GeneralPractitioner = gp;
                    patient.Allergies = allergies;
                    patient.Diagnoses = diagnoses;
                    patient.ConditionFlags = conditionFlags;
                    patient.TreatmentPlan = treatmentPlan;
                    await userManager.UpdateAsync(patient);
                }

                var hasMeds = await context.PatientMedications.AnyAsync(m => m.PatientId == patient.Id);
                if (!hasMeds)
                {
                    var order = 0;
                    foreach (var med in medications)
                    {
                        context.PatientMedications.Add(new PatientMedication
                        {
                            PatientId = patient.Id,
                            Name = med.Name,
                            Dosage = med.Dosage,
                            Schedule = med.Schedule,
                            SortOrder = order++
                        });
                    }
                    await context.SaveChangesAsync();
                }
            }

            await SeedAsync(
                "patient.ingrid@homecare.local",
                "ingrid.berg",
                new DateTime(1948, 3, 14),
                "Anne Berg",
                "datter",
                "Dr. Lars Holm",
                "Penicillin",
                "Hypertensjon, Diabetes type 2, Mild kognitiv svikt",
                "Stabil tilstand, Mobil med rullator, Selvstendig måltid",
                "Daglig oppfølging av blodtrykk og blodsukker. Støtte til morgenstell og medisinhåndtering. Observere generell tilstand og kognitiv funksjon. Rapporter avvik til fastlege.",
                new[]
                {
                    ("Metformin", "500 mg", "2× daglig — morgen og kveld"),
                    ("Lisinopril", "10 mg", "1× daglig — morgen"),
                    ("Paracet", "500 mg", "Ved behov, maks 4× daglig"),
                });

            // Placeholder profile for the "wayki" TV test patient, so the patient
            // details page and the Besøk workspace have something to render.
            await SeedAsync(
                "patient.wayki@homecare.local",
                "bong.wayki",
                new DateTime(1955, 5, 5),
                "Trang Wayki",
                "datter",
                "Dr. Lars Holm",
                "Ingen kjente",
                "Hypertensjon",
                "Stabil tilstand",
                "Testpasient for TV-appen. Daglig tilsyn og blodtrykksmåling.",
                new[]
                {
                    ("Lisinopril", "10 mg", "1× daglig — morgen"),
                });
        }

        /// <summary>
        /// Seeds the canonical demo data on a fresh database: exactly five
        /// appointments — two planned (future, Booked) and three completed past
        /// appointments, each with a real <see cref="Visit"/> record (a completed
        /// physical visit, a completed digital visit with call attempts, and a
        /// not-completed digital visit). They all belong to Ingrid — Wayki is
        /// deliberately left with an empty schedule. Runs only when no
        /// appointments exist so it never disturbs appointments created through
        /// the app.
        /// </summary>
        private static async Task SeedDemoAppointmentsAndVisitsAsync(ApplicationDbContext context)
        {
            if (await context.Appointments.AnyAsync()) return;

            var nurse = await context.Users.FirstOrDefaultAsync(u => u.Role == "Personnel");
            var ingrid = await context.Users.FirstOrDefaultAsync(u => u.UserName == "patient.ingrid@homecare.local");
            if (nurse == null || ingrid == null) return;

            var today = DateTime.Today;

            async Task<Availability> NewSlotAsync(DateTime date, TimeSpan start, TimeSpan end, string note)
            {
                var slot = new Availability
                {
                    PersonnelId = nurse.Id,
                    Date = date,
                    StartTime = start,
                    EndTime = end,
                    Notes = note
                };
                context.Availabilities.Add(slot);
                await context.SaveChangesAsync();
                return slot;
            }

            // --- 2 planned (future, Booked) ---
            var planned = new[]
            {
                new { Patient = ingrid, Date = today.AddDays(1), Start = new TimeSpan(10, 0, 0), End = new TimeSpan(11, 0, 0), Tasks = "Medisinhåndtering, Blodtrykksmåling", Note = "Sone A, Grensen 12, 0159 Oslo" },
                new { Patient = ingrid, Date = today.AddDays(2), Start = new TimeSpan(12, 0, 0), End = new TimeSpan(13, 0, 0), Tasks = "Sårstell, Tilsyn", Note = "Sone A, Grensen 12, 0159 Oslo" },
            };
            foreach (var p in planned)
            {
                var slot = await NewSlotAsync(p.Date, p.Start, p.End, p.Note);
                context.Appointments.Add(new Appointment
                {
                    PatientId = p.Patient.Id,
                    AvailabilityId = slot.Id,
                    Tasks = p.Tasks,
                    StartTime = p.Start,
                    EndTime = p.End,
                    Status = "Booked"
                });
            }
            await context.SaveChangesAsync();

            // --- 3 completed (past), each with a Visit record ---
            var completed = new[]
            {
                new { Patient = ingrid, DayBack = 2, Start = new TimeSpan(9, 0, 0),  End = new TimeSpan(10, 0, 0), Tasks = "Bathing, Dressing", Type = "Physical", Outcome = "Completed", Note = "Sone A, Grensen 12, 0159 Oslo" },
                new { Patient = ingrid, DayBack = 3, Start = new TimeSpan(11, 0, 0), End = new TimeSpan(12, 0, 0), Tasks = "Medisinhåndtering, Tilsyn", Type = "Digital", Outcome = "Completed", Note = "Digitalt" },
                new { Patient = ingrid, DayBack = 5, Start = new TimeSpan(13, 0, 0), End = new TimeSpan(14, 0, 0), Tasks = "Hjelp til måltid, Oppfølging av ernæring", Type = "Digital", Outcome = "Incomplete", Note = "Digitalt" },
            };

            foreach (var c in completed)
            {
                var date = today.AddDays(-c.DayBack);
                var startedAt = date + c.Start;
                var endedAt = date + c.End;
                var incomplete = c.Outcome == "Incomplete";

                var slot = await NewSlotAsync(date, c.Start, c.End, c.Note);
                var appt = new Appointment
                {
                    PatientId = c.Patient.Id,
                    AvailabilityId = slot.Id,
                    Tasks = c.Tasks,
                    StartTime = c.Start,
                    EndTime = c.End,
                    Status = incomplete ? "NotCompleted" : "Completed"
                };
                context.Appointments.Add(appt);
                await context.SaveChangesAsync();

                var visit = new Visit
                {
                    AppointmentId = appt.Id,
                    PatientId = c.Patient.Id,
                    ResponsibleUserId = nurse.Id,
                    VisitType = c.Type,
                    Status = c.Outcome,
                    StartedAt = startedAt,
                    EndedAt = endedAt,
                    CompletedAt = incomplete ? (DateTime?)null : endedAt,
                    FollowUpRequired = false,
                    OutcomeReason = incomplete ? "Pasienten svarte ikke" : null,
                    Notes = incomplete
                        ? "Pasienten svarte ikke etter tre forsøk. Mulig hørsel/TV-volum-problem."
                        : "Besøket ble gjennomført som planlagt. Pasienten var i god form.",
                    Tasks = c.Tasks
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(t => new VisitTask
                        {
                            Title = t,
                            Status = incomplete ? "Pending" : "Completed",
                            CompletedAt = incomplete ? (DateTime?)null : endedAt
                        })
                        .ToList()
                };
                context.Visits.Add(visit);
                await context.SaveChangesAsync();

                if (c.Type == "Digital")
                {
                    if (incomplete)
                    {
                        for (var i = 1; i <= 3; i++)
                        {
                            context.CallLogs.Add(MakeAttempt(visit, i, "Missed", startedAt.AddMinutes((i - 1) * 3), null, null));
                        }
                    }
                    else
                    {
                        // No answer, then reached on the second attempt.
                        var answeredAt = startedAt.AddMinutes(3);
                        context.CallLogs.Add(MakeAttempt(visit, 1, "Missed", startedAt, null, null));
                        context.CallLogs.Add(MakeAttempt(visit, 2, "Answered", answeredAt, endedAt, (int)(endedAt - answeredAt).TotalSeconds));
                    }
                    await context.SaveChangesAsync();
                }
            }
        }

        private static CallLog MakeAttempt(Visit visit, int number, string status, DateTime startedAt, DateTime? endedAt, int? durationSeconds)
        {
            return new CallLog
            {
                PatientId = visit.PatientId,
                PersonnelId = visit.ResponsibleUserId,
                StartedAt = startedAt,
                Status = status,
                VisitId = visit.Id,
                AppointmentId = visit.AppointmentId,
                AttemptNumber = number,
                EndedAt = endedAt,
                DurationSeconds = durationSeconds
            };
        }

        private static async Task EnsurePatientPersonnelLinkAsync(
            ApplicationDbContext context,
            UserManager<User> userManager,
            string patientUserName,
            string personnelUserName)
        {
            var patient = await userManager.FindByNameAsync(patientUserName);
            var personnel = await userManager.FindByNameAsync(personnelUserName);
            if (patient == null || personnel == null) return;

            var linkExists = await context.PatientUserLinks.AnyAsync(l =>
                l.PatientId == patient.Id &&
                l.SecondaryUserId == personnel.Id &&
                l.RelationshipType == "Personnel");

            if (!linkExists)
            {
                context.PatientUserLinks.Add(new PatientUserLink
                {
                    PatientId = patient.Id,
                    SecondaryUserId = personnel.Id,
                    RelationshipType = "Personnel"
                });
                await context.SaveChangesAsync();
            }
        }
        private static async Task EnsureDemoUserAsync(
            UserManager<User> userManager,
            string userName,
            string email,
            string fullName,
            string role,
            string phoneNumber,
            string address,
            string? supabaseProfileId = null)
        {
            var existingUser = await userManager.FindByNameAsync(userName);

            // Refuse to claim a Supabase profile someone else already holds.
            // IX_AspNetUsers_SupabaseProfileId is unique, and a violation throws
            // rather than returning a failed IdentityResult, so without this the
            // whole seeder — and startup with it — dies on any dev database where
            // this profile was linked by hand or through the portal.
            if (supabaseProfileId != null)
            {
                var linkOwner = await userManager.Users
                    .FirstOrDefaultAsync(u => u.SupabaseProfileId == supabaseProfileId);

                if (linkOwner != null && linkOwner.UserName != userName)
                {
                    Console.WriteLine(
                        $"Seeder: Supabase profile '{supabaseProfileId}' is already linked to " +
                        $"'{linkOwner.UserName}', so '{userName}' is seeded without it. " +
                        "Re-assign the link from the portal (Pasienter → rediger) if that is wrong.");

                    // Seed everything else; the link is neither stolen nor fatal.
                    supabaseProfileId = null;
                }
            }

            if (existingUser == null)
            {
                var newUser = new User
                {
                    UserName = userName,
                    Email = email,
                    FullName = fullName,
                    Role = role,
                    PhoneNumber = phoneNumber,
                    Address = address,
                    EmailConfirmed = true,
                    SupabaseProfileId = supabaseProfileId
                };

                var createResult = await userManager.CreateAsync(newUser, "Pass123!");
                if (createResult.Succeeded)
                {
                    await userManager.AddToRoleAsync(newUser, role);
                }
                else
                {
                    Console.WriteLine(
                        $"Seeder: could not create demo user '{userName}': " +
                        string.Join("; ", createResult.Errors.Select(e => e.Description)));
                }

                return;
            }

            var requiresUpdate =
                existingUser.Email != email ||
                existingUser.FullName != fullName ||
                existingUser.Role != role ||
                existingUser.PhoneNumber != phoneNumber ||
                existingUser.Address != address ||
                !existingUser.EmailConfirmed ||
                existingUser.SupabaseProfileId != supabaseProfileId;

            if (requiresUpdate)
            {
                existingUser.Email = email;
                existingUser.FullName = fullName;
                existingUser.Role = role;
                existingUser.PhoneNumber = phoneNumber;
                existingUser.Address = address;
                existingUser.EmailConfirmed = true;
                existingUser.SupabaseProfileId = supabaseProfileId;

                // A unique-index violation here would otherwise take down startup.
                // The check above covers the case we know about; this keeps any
                // other collision a warning rather than a dead backend.
                try
                {
                    await userManager.UpdateAsync(existingUser);
                }
                catch (DbUpdateException ex)
                {
                    Console.WriteLine($"Seeder: could not update demo user '{userName}': {ex.Message}");

                    // Detach whatever failed. The context is scoped and shared with
                    // the rest of the seeder, so a rejected change left in Modified
                    // state would be retried by the next SaveChangesAsync — and that
                    // one is not in a try/catch, so it would take startup down after
                    // all, which is exactly what this catch exists to prevent.
                    foreach (var entry in ex.Entries)
                    {
                        entry.State = EntityState.Detached;
                    }
                }
            }

            if (!await userManager.IsInRoleAsync(existingUser, role))
            {
                await userManager.AddToRoleAsync(existingUser, role);
            }
        }

        /// <summary>
        /// Collapses availability slots that share a personnel/date/start time,
        /// keeping the one with the most meaningful appointment.
        ///
        /// This is a workaround, not a cleanup of old data: nothing stops
        /// duplicates being created today. <c>AvailabilityService.CreateAsync</c>
        /// inserts a slot without checking for an existing one, and
        /// <c>UpdateWindowAsync</c> only compares new slots against *booked*
        /// ones, so re-saving a window can add a second free slot at the same
        /// time. The real fix is a uniqueness rule on
        /// (PersonnelId, Date, StartTime) plus a service that respects it;
        /// until then this runs on every startup.
        ///
        /// Note that it can delete an appointment (see ShouldReplaceAppointment)
        /// — which is a strong reason to fix the cause rather than keep sweeping
        /// up at startup.
        /// </summary>
        private static async Task RemoveDuplicateSlotDataAsync(ApplicationDbContext context)
        {
            var allAvailabilities = await context.Availabilities
                .Include(availability => availability.Appointment)
                .OrderBy(availability => availability.Id)
                .ToListAsync();

            var duplicateSlotGroups = allAvailabilities
                .GroupBy(availability => new
                {
                    availability.PersonnelId,
                    availability.Date,
                    availability.StartTime
                })
                .Where(group => group.Count() > 1)
                .ToList();

            foreach (var duplicateGroup in duplicateSlotGroups)
            {
                var keeper = duplicateGroup
                    .OrderByDescending(availability => availability.Appointment != null)
                    .ThenBy(availability => availability.Id)
                    .First();

                var keeperAppointment = keeper.Appointment;

                foreach (var duplicate in duplicateGroup.Where(availability => availability.Id != keeper.Id))
                {
                    if (duplicate.Appointment != null)
                    {
                        if (keeperAppointment == null)
                        {
                            duplicate.Appointment.AvailabilityId = keeper.Id;
                            keeperAppointment = duplicate.Appointment;
                        }
                        else
                        {
                            if (ShouldReplaceAppointment(keeperAppointment, duplicate.Appointment))
                            {
                                context.Appointments.Remove(keeperAppointment);
                                duplicate.Appointment.AvailabilityId = keeper.Id;
                                keeperAppointment = duplicate.Appointment;
                            }
                            else
                            {
                                context.Appointments.Remove(duplicate.Appointment);
                            }
                        }
                    }

                    context.Availabilities.Remove(duplicate);
                }
            }

            var duplicateAppointments = await context.Appointments
                .Include(appointment => appointment.Availability)
                .OrderBy(appointment => appointment.Id)
                .ToListAsync();

            var duplicateAppointmentRows = duplicateAppointments
                .GroupBy(appointment => new
                {
                    appointment.Availability.PersonnelId,
                    appointment.Availability.Date,
                    appointment.StartTime,
                    appointment.PatientId
                })
                .SelectMany(group =>
                {
                    var keep = group
                        .OrderByDescending(appointment => AppointmentStatusRank(appointment.Status))
                        .ThenByDescending(appointment => appointment.Id)
                        .First();

                    return group.Where(appointment => appointment.Id != keep.Id);
                })
                .ToList();

            if (duplicateAppointmentRows.Count > 0)
            {
                context.Appointments.RemoveRange(duplicateAppointmentRows);
            }

            if (duplicateSlotGroups.Count > 0 || duplicateAppointmentRows.Count > 0)
            {
                await context.SaveChangesAsync();
            }
        }

        private static bool ShouldReplaceAppointment(Appointment current, Appointment candidate)
        {
            var currentRank = AppointmentStatusRank(current.Status);
            var candidateRank = AppointmentStatusRank(candidate.Status);

            if (candidateRank != currentRank)
            {
                return candidateRank > currentRank;
            }

            return candidate.Id > current.Id;
        }

        private static int AppointmentStatusRank(string status)
        {
            return status switch
            {
                "InProgress" => 4,
                "Booked" => 3,
                "Completed" => 2,
                "Cancelled" => 1,
                _ => 0
            };
        }

        private static async Task EnsureUpcomingWeekAvailabilityPatternAsync(ApplicationDbContext context)
        {
            var personnel = await context.Users.FirstOrDefaultAsync(u => u.Role == "Personnel");
            if (personnel == null)
            {
                return;
            }

            var today = DateTime.Today;
            var weekEnd = today.AddDays(6);
            const string defaultAddressNote = "Sone A, Hagegata 25, 0653 Oslo";
            const string unavailableNote = "Fridag";

            var weekAvailabilities = await context.Availabilities
                .Include(availability => availability.Appointment)
                .Where(availability =>
                    availability.PersonnelId == personnel.Id
                    && availability.Date >= today
                    && availability.Date <= weekEnd)
                .ToListAsync();

            var weekWindows = await context.AvailabilityWindows
                .Where(window =>
                    window.PersonnelId == personnel.Id
                    && window.Date >= today
                    && window.Date <= weekEnd)
                .OrderBy(window => window.Date)
                .ThenBy(window => window.Id)
                .ToListAsync();

            for (var offset = 0; offset < 7; offset++)
            {
                var currentDate = today.AddDays(offset).Date;
                var dayAvailabilities = weekAvailabilities
                    .Where(availability => availability.Date == currentDate)
                    .ToList();
                var dayWindows = weekWindows
                    .Where(window => window.Date == currentDate)
                    .ToList();

                var isAvailableDay = TryGetScheduledWindowForDay(
                    currentDate.DayOfWeek,
                    out var windowStart,
                    out var windowEnd);

                var primaryWindow = dayWindows.FirstOrDefault();
                if (primaryWindow == null)
                {
                    primaryWindow = new AvailabilityWindow
                    {
                        PersonnelId = personnel.Id,
                        Date = currentDate
                    };

                    context.AvailabilityWindows.Add(primaryWindow);
                    await context.SaveChangesAsync();
                    weekWindows.Add(primaryWindow);
                    dayWindows.Add(primaryWindow);
                }

                primaryWindow.IsAvailable = isAvailableDay;
                primaryWindow.StartTime = isAvailableDay ? windowStart : TimeSpan.Zero;
                primaryWindow.EndTime = isAvailableDay ? windowEnd : TimeSpan.Zero;
                primaryWindow.Notes = isAvailableDay ? defaultAddressNote : unavailableNote;

                var desiredSlots = isAvailableDay
                    ? BuildBufferedSlots(windowStart, windowEnd)
                    : new List<(TimeSpan Start, TimeSpan End)>();

                var desiredSlotSet = desiredSlots
                    .Select(slot => slot.Start)
                    .ToHashSet();

                var staleUnbookedSlots = dayAvailabilities
                    .Where(availability =>
                        availability.Appointment == null
                        && !desiredSlotSet.Contains(availability.StartTime))
                    .ToList();

                if (staleUnbookedSlots.Count > 0)
                {
                    context.Availabilities.RemoveRange(staleUnbookedSlots);
                    weekAvailabilities.RemoveAll(availability => staleUnbookedSlots.Any(stale => stale.Id == availability.Id));
                    dayAvailabilities.RemoveAll(availability => staleUnbookedSlots.Any(stale => stale.Id == availability.Id));
                }

                if (isAvailableDay)
                {
                    foreach (var desiredSlot in desiredSlots)
                    {
                        var existingSlot = dayAvailabilities.FirstOrDefault(availability =>
                            availability.StartTime == desiredSlot.Start);

                        if (existingSlot == null)
                        {
                            var slot = new Availability
                            {
                                PersonnelId = personnel.Id,
                                Date = currentDate,
                                StartTime = desiredSlot.Start,
                                EndTime = desiredSlot.End,
                                Notes = defaultAddressNote,
                                AvailabilityWindowId = primaryWindow.Id
                            };

                            context.Availabilities.Add(slot);
                            weekAvailabilities.Add(slot);
                            dayAvailabilities.Add(slot);
                        }
                        else
                        {
                            existingSlot.AvailabilityWindowId = primaryWindow.Id;
                            if (string.IsNullOrWhiteSpace(existingSlot.Notes))
                            {
                                existingSlot.Notes = defaultAddressNote;
                            }
                        }
                    }
                }

                foreach (var extraWindow in dayWindows.Skip(1))
                {
                    var linkedAvailabilities = dayAvailabilities
                        .Where(availability => availability.AvailabilityWindowId == extraWindow.Id)
                        .ToList();

                    if (linkedAvailabilities.Any(availability => availability.Appointment != null))
                    {
                        continue;
                    }

                    if (linkedAvailabilities.Count > 0)
                    {
                        context.Availabilities.RemoveRange(linkedAvailabilities);
                        weekAvailabilities.RemoveAll(availability => linkedAvailabilities.Any(linked => linked.Id == availability.Id));
                        dayAvailabilities.RemoveAll(availability => linkedAvailabilities.Any(linked => linked.Id == availability.Id));
                    }

                    context.AvailabilityWindows.Remove(extraWindow);
                    weekWindows.Remove(extraWindow);
                }
            }

            await context.SaveChangesAsync();
        }

        private static bool TryGetScheduledWindowForDay(
            DayOfWeek dayOfWeek,
            out TimeSpan startTime,
            out TimeSpan endTime)
        {
            switch (dayOfWeek)
            {
                case DayOfWeek.Monday:
                case DayOfWeek.Friday:
                    startTime = new TimeSpan(9, 0, 0);
                    endTime = new TimeSpan(17, 0, 0);
                    return true;
                case DayOfWeek.Tuesday:
                case DayOfWeek.Thursday:
                    startTime = new TimeSpan(8, 0, 0);
                    endTime = new TimeSpan(16, 0, 0);
                    return true;
                default:
                    startTime = TimeSpan.Zero;
                    endTime = TimeSpan.Zero;
                    return false;
            }
        }

        private static List<(TimeSpan Start, TimeSpan End)> BuildBufferedSlots(TimeSpan startTime, TimeSpan endTime)
        {
            var slots = new List<(TimeSpan Start, TimeSpan End)>();
            var slotDuration = TimeSpan.FromHours(1);
            var travelDuration = TimeSpan.FromMinutes(30);
            var current = startTime;

            while (current < endTime)
            {
                var slotEnd = current.Add(slotDuration);
                if (slotEnd > endTime)
                {
                    break;
                }

                slots.Add((current, slotEnd));
                current = slotEnd.Add(travelDuration);
            }

            return slots;
        }

        private static List<Availability> GenerateSlots(AvailabilityWindow window)
        {
            var slots = new List<Availability>();

            if (!window.IsAvailable)
            {
                // Unavailable: create single slot covering the whole period
                slots.Add(new Availability
                {
                    PersonnelId = window.PersonnelId,
                    Date = window.Date,
                    StartTime = window.StartTime,
                    EndTime = window.EndTime,
                    Notes = window.Notes,
                    AvailabilityWindowId = window.Id
                });
            }
            else
            {
                // Available: 1-hour appointments with 30-minute travel buffer between visits.
                var slotDuration = TimeSpan.FromHours(1);
                var travelDuration = TimeSpan.FromMinutes(30);
                var currentTime = window.StartTime;
                while (currentTime < window.EndTime)
                {
                    var slotEnd = currentTime.Add(slotDuration);
                    if (slotEnd > window.EndTime)
                        break;

                    slots.Add(new Availability
                    {
                        PersonnelId = window.PersonnelId,
                        Date = window.Date,
                        StartTime = currentTime,
                        EndTime = slotEnd,
                        Notes = window.Notes,
                        AvailabilityWindowId = window.Id
                    });

                    currentTime = slotEnd.Add(travelDuration);
                }
            }

            return slots;
        }
    }
}
