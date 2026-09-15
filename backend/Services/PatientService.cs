using backend.DTOs;
using backend.DAL;
using backend.DAL.Repositories;
using backend.Models;
using Microsoft.AspNetCore.Identity;

namespace backend.Services
{
    public class PatientService : IPatientService
    {
        private readonly IUserRepository _userRepository;
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly IPatientUserLinkRepository _linkRepository;
        private readonly ICallLogService _callLogService;
        private readonly UserManager<User> _userManager;
        private readonly ISupabaseDailyCheckInStore? _dailyCheckIns;

        // Only for transactions. Reads and writes still go through the repositories;
        // this is the one instance they and UserManager all share, so it is what a
        // multi-step write has to begin the transaction on.
        private readonly ApplicationDbContext _context;

        public PatientService(
            IUserRepository userRepository,
            IAppointmentRepository appointmentRepository,
            IPatientUserLinkRepository linkRepository,
            ICallLogService callLogService,
            UserManager<User> userManager,
            ApplicationDbContext context,
            ISupabaseDailyCheckInStore? dailyCheckIns = null)
        {
            _userRepository = userRepository;
            _appointmentRepository = appointmentRepository;
            _linkRepository = linkRepository;
            _callLogService = callLogService;
            _userManager = userManager;
            _context = context;
            _dailyCheckIns = dailyCheckIns;
        }

        public async Task<IEnumerable<PatientListDto>> GetAllPatientsAsync()
        {
            var patients = await _userRepository.GetPatientsAsync();
            var patientList = new List<PatientListDto>();

            foreach (var patient in patients)
            {
                var appointments = await _appointmentRepository.GetByPatientIdAsync(patient.Id);
                var lastAppointment = appointments
                    .OrderByDescending(a => a.Availability.Date)
                    .FirstOrDefault();

                patientList.Add(new PatientListDto
                {
                    Id = patient.Id,
                    FullName = patient.FullName,
                    Email = patient.Email ?? string.Empty,
                    PhoneNumber = patient.PhoneNumber ?? string.Empty,
                    Address = patient.Address ?? string.Empty,
                    Latitude = patient.Latitude,
                    Longitude = patient.Longitude,
                    SupabaseProfileId = patient.SupabaseProfileId,
                    Username = patient.ProfileUsername,
                    TotalAppointments = appointments.Count(),
                    LastAppointmentDate = lastAppointment?.Availability.Date.ToString("dd/MM/yyyy") ?? "Never"
                });
            }

            return patientList;
        }

        public async Task<IEnumerable<PatientListDto>> GetLinkedPatientsAsync(string personnelId)
        {
            var links = await _linkRepository.GetBySecondaryUserIdAsync(personnelId);
            // An appointment assignment is itself a care relationship. Always
            // union it with explicit team links; the previous fallback only did
            // this when the nurse had zero links, hiding newly assigned patients
            // from nurses who already had somebody in their list.
            var appointmentPatientIds = (await _appointmentRepository
                    .GetByPersonnelIdAsync(personnelId))
                .Select(appointment => appointment.PatientId);
            var patientIds = links
                .Select(link => link.PatientId)
                .Concat(appointmentPatientIds)
                .Distinct()
                .ToHashSet();

            var patients = await _userRepository.GetPatientsAsync();
            var filteredPatients = patients.Where(p => patientIds.Contains(p.Id)).ToList();

            var patientList = new List<PatientListDto>();

            foreach (var patient in filteredPatients)
            {
                // A normal nurse's list statistics describe their own care work,
                // not appointments assigned to colleagues who happen to share
                // the patient.
                var appointments = (await _appointmentRepository.GetByPatientIdAsync(patient.Id))
                    .Where(appointment => appointment.Availability?.PersonnelId == personnelId)
                    .ToList();
                var lastAppointment = appointments
                    .OrderByDescending(a => a.Availability.Date)
                    .FirstOrDefault();

                patientList.Add(new PatientListDto
                {
                    Id = patient.Id,
                    FullName = patient.FullName,
                    Email = patient.Email ?? string.Empty,
                    PhoneNumber = patient.PhoneNumber ?? string.Empty,
                    Address = patient.Address ?? string.Empty,
                    Latitude = patient.Latitude,
                    Longitude = patient.Longitude,
                    SupabaseProfileId = patient.SupabaseProfileId,
                    Username = patient.ProfileUsername,
                    TotalAppointments = appointments.Count(),
                    LastAppointmentDate = lastAppointment?.Availability.Date.ToString("dd/MM/yyyy") ?? "Never"
                });
            }

            return patientList;
        }

        public async Task<PatientDetailsDto?> GetPatientByIdAsync(
            string patientId,
            string? viewerPersonnelId = null)
        {
            // The route key may be the readable username or the GUID id; resolve
            // username first, then fall back to the id.
            var patient = await _userRepository.GetByProfileUsernameWithMedicationsAsync(patientId)
                ?? await _userRepository.GetByIdWithMedicationsAsync(patientId);
            if (patient == null || !string.Equals(patient.Role, "Patient", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            // The route key may be a username, so use the resolved patient's GUID
            // id for the appointment/call lookups (they filter on PatientId).
            var appointments = (await _appointmentRepository.GetByPatientIdAsync(patient.Id))
                .Where(appointment =>
                    viewerPersonnelId == null ||
                    appointment.Availability?.PersonnelId == viewerPersonnelId)
                .ToList();
            var today = DateTime.Today;
            var upcomingAppointments = appointments
                .Where(appointment =>
                    appointment.Availability.Date >= today &&
                    (appointment.Status == "Booked" || appointment.Status == "InProgress"))
                .OrderBy(appointment => appointment.Availability.Date)
                .ThenBy(appointment => appointment.StartTime)
                .Take(10)
                .ToList();
            var pastAppointments = appointments
                .Where(appointment => appointment.Availability.Date < today)
                .OrderByDescending(appointment => appointment.Availability.Date)
                .ThenByDescending(appointment => appointment.StartTime)
                .ToList();
            var recentCalls = (await _callLogService.GetRecentByPatientAsync(
                patient.Id,
                5,
                viewerPersonnelId)).ToList();
            var lastAppointment = appointments
                .OrderByDescending(a => a.Availability.Date)
                .FirstOrDefault();

            return new PatientDetailsDto
            {
                Id = patient.Id,
                FullName = patient.FullName,
                Email = patient.Email ?? string.Empty,
                PhoneNumber = patient.PhoneNumber ?? string.Empty,
                Address = patient.Address ?? string.Empty,
                Latitude = patient.Latitude,
                Longitude = patient.Longitude,
                SupabaseProfileId = patient.SupabaseProfileId,
                Username = patient.ProfileUsername,
                TotalAppointments = appointments.Count,
                LastAppointmentDate = lastAppointment?.Availability.Date.ToString("dd/MM/yyyy") ?? "Never",
                Notes = patient.Notes,
                NotesUpdatedAt = patient.NotesUpdatedAt,
                UpcomingAppointments = upcomingAppointments
                    .Select(appointment => MapToAppointmentSummary(appointment, viewerPersonnelId))
                    .ToList(),
                PastAppointments = pastAppointments
                    .Select(appointment => MapToAppointmentSummary(appointment, viewerPersonnelId))
                    .ToList(),
                RecentCalls = recentCalls,
                Clinical = PatientClinicalMapper.ToDto(patient)
            };
        }

        /// <summary>
        /// Registers a patient from the portal and puts them on the caller's
        /// patient list. Optionally links them to a Supabase profile, which is
        /// what makes the TV app able to resolve them.
        /// </summary>
        public async Task<PatientDetailsDto> CreatePatientAsync(PatientCreateDto dto, string creatingPersonnelId)
        {
            var email = dto.Email.Trim();
            var supabaseProfileId = NormalizeSupabaseProfileId(dto.SupabaseProfileId);

            await EnsureSupabaseLinkIsFreeAsync(supabaseProfileId, currentPatientId: null);

            var patient = new User
            {
                // The seeded patients use their email as the username; keep new
                // ones consistent so the update path's "username follows email"
                // rule applies to them too.
                UserName = email,
                Email = email,
                FullName = dto.FullName.Trim(),
                Role = "Patient",
                PhoneNumber = string.IsNullOrWhiteSpace(dto.PhoneNumber) ? null : dto.PhoneNumber.Trim(),
                Address = string.IsNullOrWhiteSpace(dto.Address) ? null : dto.Address.Trim(),
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                EmailConfirmed = true,
                SupabaseProfileId = supabaseProfileId,
                DailyCheckInEnabled = supabaseProfileId != null,
                DailyCheckInStartedAt = supabaseProfileId != null ? DateTime.UtcNow : null
                // ProfileUsername stays null: the readable URL handle is seeder-owned,
                // so portal-registered patients are addressed by their GUID. NULLs are
                // distinct under the unique index, so any number of them coexist.
            };

            // Registration is 3 writes (account, role, patient-list link) and a
            // partial one is worse than none: the account would hold the email and
            // username while being invisible to every list, so the nurse retrying
            // would be told the address is taken by a patient they cannot see.
            // UserManager and both repositories share this scoped DbContext, so one
            // transaction covers all 3.
            await using var transaction = await _context.Database.BeginTransactionAsync();

            // Deliberately created without a password: patients authenticate
            // against Supabase on the TV app, and the portal login is
            // personnel-only, so a password here would only be a way in.
            var createResult = await _userManager.CreateAsync(patient);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(string.Join("; ", createResult.Errors.Select(e => e.Description)));
            }

            var roleResult = await _userManager.AddToRoleAsync(patient, "Patient");
            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException(string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            }

            // Without this the new patient would be missing from the very list
            // that created them: GET /api/patients returns the caller's linked
            // patients, not every patient.
            await _linkRepository.CreateAsync(new PatientUserLink
            {
                PatientId = patient.Id,
                SecondaryUserId = creatingPersonnelId,
                RelationshipType = "Personnel"
            });

            await transaction.CommitAsync();

            if (_dailyCheckIns != null)
            {
                await _dailyCheckIns.SyncPatientLinkAsync(null, supabaseProfileId);
            }

            return (await GetPatientByIdAsync(patient.Id))!;
        }

        public async Task<bool> UpdatePatientNotesAsync(string patientId, string? notes)
        {
            var patient = await _userRepository.GetByIdWithMedicationsAsync(patientId);
            if (patient == null || !string.Equals(patient.Role, "Patient", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            patient.Notes = notes;
            patient.NotesUpdatedAt = DateTime.UtcNow;
            await _userRepository.UpdateAsync(patient);
            return true;
        }

        public async Task<PatientDetailsDto?> UpdatePatientAsync(string patientId, PatientUpdateDto dto)
        {
            // Medication updates replace the current list. Load that navigation
            // explicitly; FindAsync/GetByIdAsync only loads the user row, which
            // previously left patient.Medications empty and appended a fresh copy
            // of every submitted medicine on each save.
            var patient = await _userRepository.GetByIdWithMedicationsAsync(patientId);
            if (patient == null || !string.Equals(patient.Role, "Patient", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            patient.FullName = dto.FullName;
            patient.PhoneNumber = dto.PhoneNumber;
            patient.Address = dto.Address;
            patient.Latitude = dto.Latitude;
            patient.Longitude = dto.Longitude;
            patient.DateOfBirth = dto.DateOfBirth?.Date;
            patient.NextOfKinName = Clean(dto.NextOfKinName);
            patient.NextOfKinRelation = Clean(dto.NextOfKinRelation);
            patient.GeneralPractitioner = Clean(dto.GeneralPractitioner);
            patient.Allergies = Clean(dto.Allergies);
            patient.Diagnoses = JoinList(dto.Diagnoses);
            patient.ConditionFlags = JoinList(dto.ConditionFlags);
            patient.TreatmentPlan = Clean(dto.TreatmentPlan);

            // The Supabase link is editable here so a patient created before the
            // portal could link them (or one whose TV account came later) can be
            // wired up without a seeder change.
            //
            // Only SupabaseProfileId moves. patient.ProfileUsername — the readable
            // URL handle — is deliberately left alone: linking, relinking or
            // unlinking a TV account must never rename the patient's URL.
            var supabaseProfileId = NormalizeSupabaseProfileId(dto.SupabaseProfileId);
            await EnsureSupabaseLinkIsFreeAsync(supabaseProfileId, patient.Id);
            var previousSupabaseProfileId = patient.SupabaseProfileId;
            var linkChanged = !string.Equals(
                patient.SupabaseProfileId,
                supabaseProfileId,
                StringComparison.OrdinalIgnoreCase);
            patient.SupabaseProfileId = supabaseProfileId;
            patient.DailyCheckInEnabled = supabaseProfileId != null;
            if (linkChanged)
            {
                patient.DailyCheckInStartedAt = supabaseProfileId != null ? DateTime.UtcNow : null;
                patient.LastDailyCheckInAt = null;
                patient.LastDailyCheckInSource = null;
                patient.LastDailyCheckInConfirmedByUserId = null;
            }

            // Email changes go through UserManager so the normalized columns stay
            // consistent. Seeded accounts use the email as their username, so keep
            // them in sync only when that is currently the case.
            var emailChanged = !string.Equals(patient.Email, dto.Email, StringComparison.OrdinalIgnoreCase);
            if (emailChanged)
            {
                var usernameMatchesEmail = string.Equals(patient.UserName, patient.Email, StringComparison.OrdinalIgnoreCase);

                // Note: SetEmailAsync resets EmailConfirmed to false. That's fine
                // here because patients authenticate via Supabase (not this
                // backend) and the web portal login is Personnel-only; revisit if
                // confirmed-email sign-in is ever enforced on this backend.
                var emailResult = await _userManager.SetEmailAsync(patient, dto.Email);
                if (!emailResult.Succeeded)
                {
                    throw new InvalidOperationException(string.Join("; ", emailResult.Errors.Select(e => e.Description)));
                }

                if (usernameMatchesEmail)
                {
                    var userNameResult = await _userManager.SetUserNameAsync(patient, dto.Email);
                    if (!userNameResult.Succeeded)
                    {
                        throw new InvalidOperationException(string.Join("; ", userNameResult.Errors.Select(e => e.Description)));
                    }
                }
            }

            var submittedMedications = dto.Medications
                .Where(m => !string.IsNullOrWhiteSpace(m.Name))
                .Select(m => new
                {
                    Name = m.Name.Trim(),
                    Dosage = Clean(m.Dosage),
                    Schedule = Clean(m.Schedule),
                })
                // Be defensive about an already duplicated form payload. Two
                // rows with the same normalized name, dose and schedule describe
                // the same current medicine and must be persisted only once.
                .GroupBy(m => new
                {
                    Name = m.Name.ToUpperInvariant(),
                    Dosage = (m.Dosage ?? string.Empty).ToUpperInvariant(),
                    Schedule = (m.Schedule ?? string.Empty).ToUpperInvariant(),
                })
                .Select(group => group.First())
                .ToList();

            _context.PatientMedications.RemoveRange(patient.Medications);
            patient.Medications.Clear();
            foreach (var (medication, index) in submittedMedications.Select((medication, index) => (medication, index)))
            {
                patient.Medications.Add(new PatientMedication
                {
                    PatientId = patient.Id,
                    Name = medication.Name,
                    Dosage = medication.Dosage,
                    Schedule = medication.Schedule,
                    SortOrder = index,
                });
            }

            // Persist contact, clinical and medication fields together.
            await _context.SaveChangesAsync();

            if (linkChanged && _dailyCheckIns != null)
            {
                await _dailyCheckIns.SyncPatientLinkAsync(
                    previousSupabaseProfileId,
                    supabaseProfileId);
            }

            // Read back by id rather than by the route key, which may have been
            // the profile username that this update just changed.
            return await GetPatientByIdAsync(patient.Id);
        }

        /// <summary>
        /// Lowercased on purpose: <see cref="IUserRepository.GetBySupabaseProfileIdAsync"/>
        /// compares exactly so it can use the index, and Supabase issues
        /// lowercase UUIDs. Blank means "not linked".
        /// </summary>
        private static string? NormalizeSupabaseProfileId(string? value)
        {
            var trimmed = value?.Trim();
            return string.IsNullOrEmpty(trimmed) ? null : trimmed.ToLowerInvariant();
        }

        private static string? Clean(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static string? JoinList(IEnumerable<string>? values)
        {
            var cleaned = (values ?? Array.Empty<string>())
                .Select(Clean)
                .Where(value => value != null)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            return cleaned.Count == 0 ? null : string.Join(", ", cleaned);
        }

        /// <summary>
        /// Refuses a Supabase profile already claimed by someone else.
        /// IX_AspNetUsers_SupabaseProfileId is unique, so without this a collision
        /// would surface as a 500 from SQLite instead of a message the nurse can
        /// act on. <paramref name="currentPatientId"/> is null when creating, and
        /// the patient's own id when editing (so re-saving an unchanged form is
        /// not treated as a conflict).
        ///
        /// Only the Supabase id is checked. The local URL handle plays no part in
        /// validating a TV link — the two are independent by design.
        /// </summary>
        private async Task EnsureSupabaseLinkIsFreeAsync(
            string? supabaseProfileId,
            string? currentPatientId)
        {
            if (supabaseProfileId == null)
            {
                return;
            }

            var owner = await _userRepository.GetBySupabaseProfileIdAsync(supabaseProfileId);
            if (owner != null && owner.Id != currentPatientId)
            {
                throw new InvalidOperationException(
                    $"Supabase-profilen er allerede koblet til {owner.FullName}.");
            }
        }

        private static AppointmentSummaryDto MapToAppointmentSummary(
            Appointment appointment,
            string? viewerPersonnelId = null)
        {
            // Old/imported records can contain a visit whose responsible user no
            // longer matches the appointment assignment. Keep that colleague's
            // visit metadata out of a normal nurse's patient response.
            var canSeeVisit = viewerPersonnelId == null ||
                appointment.Visit?.ResponsibleUserId == viewerPersonnelId;

            return new AppointmentSummaryDto
            {
                Id = appointment.Id,
                PatientName = appointment.Patient?.FullName ?? string.Empty,
                PersonnelId = appointment.Availability?.PersonnelId ?? string.Empty,
                PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
                Tasks = appointment.Tasks,
                Date = appointment.Availability?.Date ?? DateTime.MinValue,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = appointment.Status,
                PatientResponseStatus = appointment.PatientResponseStatus,
                PatientRespondedAt = appointment.PatientRespondedAt,
                PatientProposedDate = appointment.PatientProposedDate?.ToString("yyyy-MM-dd"),
                PatientProposedStartTime = appointment.PatientProposedStartTime?.ToString(@"hh\:mm"),
                PatientProposedEndTime = appointment.PatientProposedEndTime?.ToString(@"hh\:mm"),
                FormattedDateTime = $"{appointment.Availability?.Date:yyyy-MM-dd} {appointment.StartTime:hh\\:mm}-{appointment.EndTime:hh\\:mm}",
                AvailabilityNotes = appointment.Availability?.Notes ?? string.Empty,
                VisitId = canSeeVisit ? appointment.Visit?.Id : null,
                VisitStatus = canSeeVisit ? appointment.Visit?.Status : null,
                VisitType = canSeeVisit ? appointment.Visit?.VisitType : null
            };
        }
    }
}
