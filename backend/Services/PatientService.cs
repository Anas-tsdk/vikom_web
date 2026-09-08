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
            ApplicationDbContext context)
        {
            _userRepository = userRepository;
            _appointmentRepository = appointmentRepository;
            _linkRepository = linkRepository;
            _callLogService = callLogService;
            _userManager = userManager;
            _context = context;
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
            var patientIds = links.Select(l => l.PatientId).Distinct().ToList();

            var patients = await _userRepository.GetPatientsAsync();
            var filteredPatients = patients.Where(p => patientIds.Contains(p.Id)).ToList();

            // If there are no link records yet, fall back to appointment-based patients.
            if (!filteredPatients.Any())
            {
                filteredPatients = (await _userRepository.GetPatientsByPersonnelAsync(personnelId)).ToList();
            }

            var patientList = new List<PatientListDto>();

            foreach (var patient in filteredPatients)
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
                    SupabaseProfileId = patient.SupabaseProfileId,
                    Username = patient.ProfileUsername,
                    TotalAppointments = appointments.Count(),
                    LastAppointmentDate = lastAppointment?.Availability.Date.ToString("dd/MM/yyyy") ?? "Never"
                });
            }

            return patientList;
        }

        public async Task<PatientDetailsDto?> GetPatientByIdAsync(string patientId)
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
            var appointments = (await _appointmentRepository.GetByPatientIdAsync(patient.Id)).ToList();
            var upcomingAppointments = (await _appointmentRepository.GetUpcomingByPatientIdAsync(patient.Id, 10)).ToList();
            var pastAppointments = (await _appointmentRepository.GetHistoryByPatientIdAsync(patient.Id)).ToList();
            var recentCalls = (await _callLogService.GetRecentByPatientAsync(patient.Id, 5)).ToList();
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
                SupabaseProfileId = patient.SupabaseProfileId,
                Username = patient.ProfileUsername,
                TotalAppointments = appointments.Count,
                LastAppointmentDate = lastAppointment?.Availability.Date.ToString("dd/MM/yyyy") ?? "Never",
                Notes = patient.Notes,
                NotesUpdatedAt = patient.NotesUpdatedAt,
                UpcomingAppointments = upcomingAppointments.Select(MapToAppointmentSummary).ToList(),
                PastAppointments = pastAppointments.Select(MapToAppointmentSummary).ToList(),
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
                EmailConfirmed = true,
                SupabaseProfileId = supabaseProfileId
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

            return (await GetPatientByIdAsync(patient.Id))!;
        }

        public async Task<bool> UpdatePatientNotesAsync(string patientId, string? notes)
        {
            var patient = await _userRepository.GetByIdAsync(patientId);
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
            var patient = await _userRepository.GetByIdAsync(patientId);
            if (patient == null || !string.Equals(patient.Role, "Patient", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            patient.FullName = dto.FullName;
            patient.PhoneNumber = dto.PhoneNumber;
            patient.Address = dto.Address;

            // The Supabase link is editable here so a patient created before the
            // portal could link them (or one whose TV account came later) can be
            // wired up without a seeder change.
            //
            // Only SupabaseProfileId moves. patient.ProfileUsername — the readable
            // URL handle — is deliberately left alone: linking, relinking or
            // unlinking a TV account must never rename the patient's URL.
            var supabaseProfileId = NormalizeSupabaseProfileId(dto.SupabaseProfileId);
            await EnsureSupabaseLinkIsFreeAsync(supabaseProfileId, patient.Id);
            patient.SupabaseProfileId = supabaseProfileId;

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

            // Persist the non-Identity fields (FullName/PhoneNumber/Address).
            await _userRepository.UpdateAsync(patient);

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

        private static AppointmentSummaryDto MapToAppointmentSummary(Appointment appointment)
        {
            return new AppointmentSummaryDto
            {
                Id = appointment.Id,
                PatientName = appointment.Patient?.FullName ?? string.Empty,
                PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
                Tasks = appointment.Tasks,
                Date = appointment.Availability?.Date ?? DateTime.MinValue,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = appointment.Status,
                FormattedDateTime = $"{appointment.Availability?.Date:yyyy-MM-dd} {appointment.StartTime:hh\\:mm}-{appointment.EndTime:hh\\:mm}",
                AvailabilityNotes = appointment.Availability?.Notes ?? string.Empty,
                VisitId = appointment.Visit?.Id,
                VisitStatus = appointment.Visit?.Status,
                VisitType = appointment.Visit?.VisitType
            };
        }
    }
}
