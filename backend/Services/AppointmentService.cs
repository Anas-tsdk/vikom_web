using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Globalization;

namespace backend.Services
{
    public class AppointmentService : IAppointmentService
    {
        private static readonly SemaphoreSlim BookingLock = new(1, 1);

        private readonly IAppointmentRepository _appointmentRepository;
        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IAvailabilityService _availabilityService;
        private readonly IUserRepository _userRepository;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AppointmentService> _logger;

        public AppointmentService(
            IAppointmentRepository appointmentRepository,
            IAvailabilityRepository availabilityRepository,
            IAvailabilityService availabilityService,
            IUserRepository userRepository,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<AppointmentService> logger)
        {
            _appointmentRepository = appointmentRepository;
            _availabilityRepository = availabilityRepository;
            _availabilityService = availabilityService;
            _userRepository = userRepository;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<IEnumerable<AppointmentDto>> GetAllAsync()
        {
            var appointments = await _appointmentRepository.GetAllAsync();
            return appointments.Select(MapToDto);
        }

        public async Task<AppointmentDto?> GetByIdAsync(int id)
        {
            var appointment = await _appointmentRepository.GetByIdAsync(id);
            return appointment == null ? null : MapToDto(appointment);
        }

        public async Task<IEnumerable<AppointmentDto>> GetByPatientIdAsync(string patientId)
        {
            var appointments = await _appointmentRepository.GetByPatientIdAsync(patientId);
            return appointments.Select(MapToDto);
        }

        public async Task<IEnumerable<AppointmentDto>> GetByPersonnelIdAsync(string personnelId)
        {
            var appointments = await _appointmentRepository.GetByPersonnelIdAsync(personnelId);
            return appointments.Select(MapToDto);
        }

        public async Task<AppointmentDto> CreateAsync(AppointmentDto appointmentDto)
        {
            await BookingLock.WaitAsync();
            try
            {
                var availability = await _availabilityRepository.GetByIdAsync(appointmentDto.AvailabilityId);

                if (availability == null)
                    throw new InvalidOperationException("Availability not found");

                if (availability.IsAppointmentArchive)
                    throw new InvalidOperationException("Availability slot is not bookable");

                if (availability.Appointment?.Status == "Completed")
                {
                    await ArchiveCompletedAppointmentSlotAsync(availability.Appointment);
                    availability = await _availabilityRepository.GetByIdAsync(appointmentDto.AvailabilityId);
                    if (availability == null)
                        throw new InvalidOperationException("Availability not found");
                }

                if (availability.Appointment != null)
                    throw new InvalidOperationException("Availability slot is already booked");

                var appointmentDateTime =
                    availability.Date.Date + availability.StartTime;

                if (appointmentDateTime <= DateTime.Now)
                    throw new InvalidOperationException("Cannot book appointments in the past");

                var patient = await _userRepository.GetByIdAsync(appointmentDto.PatientId);
                if (patient == null)
                    throw new InvalidOperationException("Patient not found");

                var additionalDuration = appointmentDto.AdditionalDurationMinutes ?? 0;
                var endTime = await ValidateScheduleAsync(
                    availability,
                    patient,
                    appointmentDto.Tasks,
                    additionalDuration);
                await EnsurePatientHasNotDeclinedSlotAsync(
                    appointmentDto.PatientId,
                    availability,
                    endTime);

                var appointment = new Appointment
                {
                    PatientId = appointmentDto.PatientId,
                    AvailabilityId = appointmentDto.AvailabilityId,
                    Tasks = appointmentDto.Tasks,
                    AdditionalDurationMinutes = additionalDuration,
                    StartTime = availability.StartTime,
                    EndTime = endTime,
                    Status = "Booked",
                    PatientResponseStatus = "Pending"
                };

                var created =
                    await _appointmentRepository.CreateAsync(appointment);

                var result =
                    await _appointmentRepository.GetByIdAsync(created.Id);

                if (result != null)
                    await EmitAppointmentRealtimeEventAsync(result, "created");

                return MapToDto(result!);
            }
            catch (DbUpdateException ex) when (IsOverlapConstraint(ex))
            {
                throw new InvalidOperationException(
                    "The nurse or patient already has an overlapping appointment",
                    ex);
            }
            finally
            {
                BookingLock.Release();
            }
        }

        public async Task<AppointmentDto> UpdateAsync(
            int id,
            AppointmentDto appointmentDto)
        {
            await BookingLock.WaitAsync();
            try
            {
                var existing =
                    await _appointmentRepository.GetByIdAsync(id);

                if (existing == null)
                    throw new InvalidOperationException("Appointment not found");

                var updated = false;
                var scheduleChanged = false;
                var replannedAfterPatientDecline = false;

                if (appointmentDto.AvailabilityId != 0 &&
                    appointmentDto.AvailabilityId != existing.AvailabilityId)
                {
                    var isPatientDeclinedCancellation =
                        existing.Status == "Cancelled" &&
                        existing.PatientResponseStatus == "Declined";

                    if (existing.Status != "Booked" && !isPatientDeclinedCancellation)
                        throw new InvalidOperationException("Only planned appointments can be rescheduled");

                    var currentAppointmentDateTime = existing.Availability.Date.Date + existing.StartTime;
                    if (!isPatientDeclinedCancellation &&
                        (currentAppointmentDateTime - DateTime.Now).TotalHours < 24)
                        throw new InvalidOperationException(
                            "Appointments cannot be modified less than 24 hours before the scheduled time");

                    var newAvailability = await _availabilityRepository.GetByIdAsync(appointmentDto.AvailabilityId);
                    if (newAvailability == null)
                        throw new InvalidOperationException("Availability not found");
                    if (newAvailability.IsAppointmentArchive)
                        throw new InvalidOperationException("Availability slot is not bookable");
                    if (newAvailability.Appointment?.Status == "Completed" &&
                        newAvailability.Appointment.Id != existing.Id)
                    {
                        await ArchiveCompletedAppointmentSlotAsync(newAvailability.Appointment);
                        newAvailability = await _availabilityRepository.GetByIdAsync(appointmentDto.AvailabilityId);
                        if (newAvailability == null)
                            throw new InvalidOperationException("Availability not found");
                    }
                    if (newAvailability.Appointment != null && newAvailability.Appointment.Id != existing.Id)
                        throw new InvalidOperationException("Availability slot is already booked");
                    if (newAvailability.Date.Date + newAvailability.StartTime <= DateTime.Now)
                        throw new InvalidOperationException("Cannot book appointments in the past");

                    existing.AvailabilityId = newAvailability.Id;
                    existing.Availability = newAvailability;
                    existing.StartTime = newAvailability.StartTime;
                    scheduleChanged = true;
                    // A changed time is a new proposal and must be confirmed again.
                    existing.Status = "Booked";
                    existing.PatientResponseStatus = "Pending";
                    existing.PatientRespondedAt = null;
                    existing.PatientProposedDate = null;
                    existing.PatientProposedStartTime = null;
                    existing.PatientProposedEndTime = null;
                    replannedAfterPatientDecline = isPatientDeclinedCancellation;
                    updated = true;
                }

                if (!string.Equals(
                        appointmentDto.Tasks,
                        existing.Tasks,
                        StringComparison.Ordinal))
                {
                    var appointmentDateTime =
                        existing.Availability.Date.Date +
                        existing.StartTime;

                    var hoursUntilAppointment =
                        (appointmentDateTime - DateTime.Now).TotalHours;

                    if (hoursUntilAppointment < 24)
                    {
                        throw new InvalidOperationException(
                            "Appointments cannot be modified less than 24 hours before the scheduled time");
                    }

                    existing.Tasks = appointmentDto.Tasks;
                    scheduleChanged = true;
                    updated = true;
                }

                if (appointmentDto.AdditionalDurationMinutes is int requestedAdditionalDuration &&
                    requestedAdditionalDuration != existing.AdditionalDurationMinutes)
                {
                    var appointmentDateTime =
                        existing.Availability.Date.Date + existing.StartTime;
                    if ((appointmentDateTime - DateTime.Now).TotalHours < 24)
                        throw new InvalidOperationException(
                            "Appointments cannot be modified less than 24 hours before the scheduled time");

                    existing.AdditionalDurationMinutes = requestedAdditionalDuration;
                    scheduleChanged = true;
                    updated = true;
                }

                if (!(replannedAfterPatientDecline && appointmentDto.Status == "Cancelled") &&
                    !string.IsNullOrEmpty(appointmentDto.Status) &&
                    appointmentDto.Status != existing.Status)
                {
                    var currentStatus = existing.Status;
                    var newStatus = appointmentDto.Status;

                    var validTransition =
                        (currentStatus, newStatus) switch
                        {
                            ("Booked", "InProgress") => true,
                            ("Booked", "Cancelled") => true,
                            ("InProgress", "Completed") => true,
                            ("InProgress", "Cancelled") => true,
                            _ => false
                        };

                    if (!validTransition)
                    {
                        throw new InvalidOperationException(
                            $"Invalid status transition from {currentStatus} to {newStatus}");
                    }

                    if (newStatus == "Cancelled")
                    {
                        var appointmentDateTime =
                            existing.Availability.Date.Date +
                            existing.StartTime;

                        var hoursUntilAppointment =
                            (appointmentDateTime - DateTime.Now).TotalHours;

                        if (hoursUntilAppointment < 24)
                        {
                            throw new InvalidOperationException(
                                "Appointments cannot be cancelled less than 24 hours before the scheduled time");
                        }
                    }

                    existing.Status = newStatus;
                    if (newStatus == "Completed")
                        MoveCompletedAppointmentToArchive(existing);
                    updated = true;
                }

                if (scheduleChanged)
                {
                    var endTime = await ValidateScheduleAsync(
                        existing.Availability,
                        existing.Patient,
                        existing.Tasks,
                        existing.AdditionalDurationMinutes,
                        existing.Id);
                    await EnsurePatientHasNotDeclinedSlotAsync(
                        existing.PatientId,
                        existing.Availability,
                        endTime);
                    existing.EndTime = endTime;
                }

                if (!updated)
                {
                    return MapToDto(existing);
                }

                var updatedAppointment =
                    await _appointmentRepository.UpdateAsync(existing);

                var result =
                    await _appointmentRepository.GetByIdAsync(
                        updatedAppointment.Id);

                if (result != null)
                {
                    await EmitAppointmentRealtimeEventAsync(
                        result,
                        "updated");
                }

                return MapToDto(result!);
            }
            catch (DbUpdateException ex) when (IsOverlapConstraint(ex))
            {
                throw new InvalidOperationException(
                    "The nurse or patient already has an overlapping appointment",
                    ex);
            }
            finally
            {
                BookingLock.Release();
            }
        }

        public async Task MarkCompletedAsync(int id)
        {
            await BookingLock.WaitAsync();
            try
            {
                var appointment = await _appointmentRepository.GetByIdAsync(id);
                if (appointment == null)
                    throw new InvalidOperationException("Appointment not found");

                appointment.Status = "Completed";
                MoveCompletedAppointmentToArchive(appointment);
                var updated = await _appointmentRepository.UpdateAsync(appointment);
                var result = await _appointmentRepository.GetByIdAsync(updated.Id);
                if (result != null)
                    await EmitAppointmentRealtimeEventAsync(result, "updated");
            }
            catch (DbUpdateException ex) when (IsOverlapConstraint(ex))
            {
                throw new InvalidOperationException(
                    "The nurse or patient already has an overlapping appointment",
                    ex);
            }
            finally
            {
                BookingLock.Release();
            }
        }

        public async Task<AppointmentDto> AcceptPatientProposalAsync(int id)
        {
            await BookingLock.WaitAsync();
            try
            {
                var appointment = await _appointmentRepository.GetByIdAsync(id);
                if (appointment == null)
                    throw new InvalidOperationException("Appointment not found");

                if (appointment.Status != "Cancelled" ||
                    appointment.PatientResponseStatus != "Declined" ||
                    appointment.PatientProposedDate == null ||
                    appointment.PatientProposedStartTime == null ||
                    appointment.PatientProposedEndTime == null)
                    throw new InvalidOperationException(
                        "Only declined appointments with a proposed time can be accepted");

                var proposedDate = appointment.PatientProposedDate.Value.Date;
                var proposedStart = appointment.PatientProposedStartTime.Value;
                var proposedEnd = appointment.PatientProposedEndTime.Value;
                if (proposedDate + proposedStart <= DateTime.Now || proposedEnd <= proposedStart)
                    throw new InvalidOperationException(
                        "The proposed time must be in the future and end after it starts");

                await _availabilityService.GetDayAvailabilityAsync(
                    appointment.Availability.PersonnelId,
                    proposedDate);

                var availableSlots = await _availabilityRepository.GetByPersonnelIdAsync(
                    appointment.Availability.PersonnelId);
                var candidates = availableSlots
                    .Where(slot =>
                    slot.Date.Date == proposedDate &&
                    slot.Appointment == null &&
                    slot.StartTime >= proposedStart &&
                    slot.Date.Date + slot.StartTime > DateTime.Now)
                    .OrderBy(slot => Math.Abs((slot.StartTime - proposedStart).Ticks))
                    .ThenBy(slot => slot.StartTime)
                    .ThenBy(slot => slot.Id)
                    .ToList();

                Availability? selectedSlot = null;
                TimeSpan selectedEnd = default;
                foreach (var slot in candidates)
                {
                    var end = await TryGetScheduleEndTimeAsync(
                        slot,
                        appointment.Patient,
                        appointment.Tasks,
                        appointment.AdditionalDurationMinutes,
                        appointment.Id);
                    if (end is null || end.Value > proposedEnd)
                        continue;

                    if (await HasPatientDeclinedSlotOverlapAsync(
                        appointment.PatientId,
                        slot,
                        end.Value))
                        continue;
                    selectedSlot = slot;
                    selectedEnd = end.Value;
                    break;
                }

                if (selectedSlot == null)
                    throw new InvalidOperationException("No available nurse slot fits the proposed time");

                appointment.AvailabilityId = selectedSlot.Id;
                appointment.Availability = selectedSlot;
                appointment.StartTime = selectedSlot.StartTime;
                appointment.EndTime = selectedEnd;
                appointment.Status = "Booked";
                appointment.PatientResponseStatus = "Accepted";
                appointment.PatientRespondedAt = DateTime.UtcNow;
                appointment.PatientProposedDate = null;
                appointment.PatientProposedStartTime = null;
                appointment.PatientProposedEndTime = null;

                var updated = await _appointmentRepository.UpdateAsync(appointment);
                var result = await _appointmentRepository.GetByIdAsync(updated.Id);
                if (result != null)
                    await EmitAppointmentRealtimeEventAsync(result, "updated");

                return MapToDto(result!);
            }
            catch (DbUpdateException ex) when (IsOverlapConstraint(ex))
            {
                throw new InvalidOperationException(
                    "The nurse or patient already has an overlapping appointment",
                    ex);
            }
            finally
            {
                BookingLock.Release();
            }
        }

        public async Task<AppointmentDto?> RespondToInvitationAsync(
            int id,
            string patientId,
            string response,
            string? proposedDate = null,
            string? proposedStartTime = null,
            string? proposedEndTime = null)
        {
            await BookingLock.WaitAsync();
            try
            {
                var appointment = await _appointmentRepository.GetByIdAsync(id);
                if (appointment == null || appointment.PatientId != patientId)
                    return null;

                var normalizedResponse = response.Trim();
                if (normalizedResponse != "Accepted" && normalizedResponse != "Declined")
                    throw new InvalidOperationException("Response must be Accepted or Declined");

                var hasAnyProposal =
                    !string.IsNullOrWhiteSpace(proposedDate) ||
                    !string.IsNullOrWhiteSpace(proposedStartTime) ||
                    !string.IsNullOrWhiteSpace(proposedEndTime);
                if (normalizedResponse == "Accepted" && hasAnyProposal)
                    throw new InvalidOperationException("An accepted appointment cannot include an alternative time");

                DateTime? parsedProposedDate = null;
                TimeSpan? parsedProposedStart = null;
                TimeSpan? parsedProposedEnd = null;
                if (hasAnyProposal)
                {
                    if (string.IsNullOrWhiteSpace(proposedDate) ||
                        string.IsNullOrWhiteSpace(proposedStartTime) ||
                        string.IsNullOrWhiteSpace(proposedEndTime))
                        throw new InvalidOperationException("A proposed date, start time and end time are all required");

                    if (!DateTime.TryParseExact(
                            proposedDate,
                            "yyyy-MM-dd",
                            CultureInfo.InvariantCulture,
                            DateTimeStyles.None,
                            out var dateValue) ||
                        !TimeSpan.TryParseExact(
                            proposedStartTime,
                            @"hh\:mm",
                            CultureInfo.InvariantCulture,
                            out var startValue) ||
                        !TimeSpan.TryParseExact(
                            proposedEndTime,
                            @"hh\:mm",
                            CultureInfo.InvariantCulture,
                            out var endValue))
                        throw new InvalidOperationException("The proposed date or time is invalid");

                    if (dateValue.Date + startValue <= DateTime.Now || endValue <= startValue)
                        throw new InvalidOperationException("The proposed time must be in the future and end after it starts");

                    parsedProposedDate = dateValue.Date;
                    parsedProposedStart = startValue;
                    parsedProposedEnd = endValue;
                }

                // Repeating the same response is safe for mobile/TV retry logic.
                if (appointment.PatientResponseStatus == normalizedResponse)
                    return MapToDto(appointment);

                if (appointment.PatientResponseStatus != "Pending")
                    throw new InvalidOperationException("This appointment invitation has already been answered");

                var appointmentStart = appointment.Availability.Date.Date + appointment.StartTime;
                if (appointmentStart <= DateTime.Now || appointment.Status != "Booked")
                    throw new InvalidOperationException("This appointment invitation can no longer be answered");

                appointment.PatientResponseStatus = normalizedResponse;
                appointment.PatientRespondedAt = DateTime.UtcNow;
                appointment.PatientProposedDate = parsedProposedDate;
                appointment.PatientProposedStartTime = parsedProposedStart;
                appointment.PatientProposedEndTime = parsedProposedEnd;
                if (normalizedResponse == "Declined")
                {
                    await _appointmentRepository.RecordDeclinedSlotAsync(
                        new DeclinedAppointmentSlot
                        {
                            PatientId = appointment.PatientId,
                            Date = appointment.Availability.Date.Date,
                            StartTime = appointment.StartTime,
                            EndTime = appointment.EndTime,
                            RecordedAt = DateTime.UtcNow
                        });
                    appointment.Status = "Cancelled";
                }

                await _appointmentRepository.UpdateAsync(appointment);
                var result = await _appointmentRepository.GetByIdAsync(id);
                if (result != null)
                    await EmitAppointmentRealtimeEventAsync(result, normalizedResponse.ToLowerInvariant());

                return result == null ? null : MapToDto(result);
            }
            finally
            {
                BookingLock.Release();
            }
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var appointment =
                await _appointmentRepository.GetByIdAsync(id);

            if (appointment == null)
            {
                throw new InvalidOperationException(
                    "Appointment not found");
            }

            var appointmentDateTime =
                appointment.Availability.Date.Date +
                appointment.StartTime;

            var hoursUntilAppointment =
                (appointmentDateTime - DateTime.Now).TotalHours;

            if (hoursUntilAppointment < 24)
            {
                throw new InvalidOperationException(
                    "Appointments cannot be cancelled less than 24 hours before the scheduled time");
            }

            appointment.Status = "Cancelled";

            await _appointmentRepository.UpdateAsync(appointment);

            await EmitAppointmentRealtimeEventAsync(
                appointment,
                "cancelled");

            return true;
        }

        private async Task EmitAppointmentRealtimeEventAsync(
            Appointment appointment,
            string action)
        {
            var targetSupabaseProfileId =
                appointment.Patient?.SupabaseProfileId?.Trim();

            var payload =
                AppointmentRealtimeEventService.BuildPayload(
                    appointmentId: appointment.Id,
                    action: action,
                    date:
                        appointment.Availability?.Date
                            .ToString("yyyy-MM-dd")
                        ?? string.Empty,
                    startTime:
                        appointment.StartTime.ToString(@"hh\:mm"),
                    endTime:
                        appointment.EndTime.ToString(@"hh\:mm"),
                    personnelName:
                        appointment.Availability?
                            .Personnel?
                            .FullName
                        ?? string.Empty,
                    // Same derived value the REST responses use, so a client mixing
                    // pushed events with a pulled list cannot see two different
                    // statuses for one appointment.
                    status: AppointmentStatusResolver.Resolve(
                        appointment.Status,
                        appointment.Availability?.Date ?? default,
                        appointment.EndTime,
                        DateTime.Now),
                    patientResponseStatus: appointment.PatientResponseStatus,
                    shortMessage:
                        string.IsNullOrWhiteSpace(appointment.Tasks)
                            ? "Appointment update"
                            : appointment.Tasks,
                    patientName: appointment.Patient?.FullName ?? string.Empty,
                    patientProposedDate: appointment.PatientProposedDate?.ToString("yyyy-MM-dd"),
                    patientProposedStartTime: appointment.PatientProposedStartTime?.ToString(@"hh\:mm"),
                    patientProposedEndTime: appointment.PatientProposedEndTime?.ToString(@"hh\:mm"));

            try
            {
                var supabaseUrl =
                    _configuration["Supabase:Url"]
                    ?? Environment.GetEnvironmentVariable(
                        "SUPABASE_URL");

                var supabaseKey =
                    _configuration["Supabase:ServiceRoleKey"]
                    ?? _configuration["Supabase:AnonKey"]
                    ?? Environment.GetEnvironmentVariable(
                        "SUPABASE_SERVICE_ROLE_KEY")
                    ?? Environment.GetEnvironmentVariable(
                        "SUPABASE_ANON_KEY");

                if (string.IsNullOrWhiteSpace(supabaseUrl) ||
                    string.IsNullOrWhiteSpace(supabaseKey))
                {
                    _logger.LogWarning(
                        "Supabase realtime configuration is missing; skipping appointment event for appointment {AppointmentId}",
                        appointment.Id);

                    return;
                }

                var targets = new Dictionary<string, string>(StringComparer.Ordinal);
                if (!string.IsNullOrWhiteSpace(targetSupabaseProfileId))
                    targets[targetSupabaseProfileId] = "appointment_event";

                var assignedPersonnelId = appointment.Availability?.PersonnelId?.Trim();
                if (!string.IsNullOrWhiteSpace(assignedPersonnelId))
                    targets[assignedPersonnelId] = "appointment_staff_event";

                foreach (var headNurse in await _userRepository.GetByRoleAsync(UserRoles.HeadNurse))
                {
                    if (!string.IsNullOrWhiteSpace(headNurse.Id))
                        targets[headNurse.Id] = "appointment_staff_event";
                }

                var client = _httpClientFactory.CreateClient();
                foreach (var (targetId, eventType) in targets)
                {
                    var wrapper = AppointmentRealtimeEventService.BuildWrapper(targetId, payload, eventType);
                    using var request = new HttpRequestMessage(
                        HttpMethod.Post,
                        $"{supabaseUrl.TrimEnd('/')}/realtime/v1/api/broadcast/webrtc-signaling/events/message");
                    request.Content = JsonContent.Create(wrapper);
                    request.Headers.Add("apikey", supabaseKey);
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseKey);

                    using var response = await client.SendAsync(request);
                    if (!response.IsSuccessStatusCode)
                    {
                        var responseBody = await response.Content.ReadAsStringAsync();
                        _logger.LogWarning(
                            "Appointment realtime event failed for appointment {AppointmentId}, target {TargetId}, status {StatusCode}: {ResponseBody}",
                            appointment.Id,
                            targetId,
                            response.StatusCode,
                            responseBody);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to send appointment realtime event for appointment {AppointmentId}",
                    appointment.Id);
            }
        }

        private async Task EnsurePatientHasNotDeclinedSlotAsync(
            string patientId,
            Availability candidate,
            TimeSpan endTime)
        {
            if (await HasPatientDeclinedSlotOverlapAsync(patientId, candidate, endTime))
            {
                throw new InvalidOperationException(
                    "Cannot schedule a patient in a time range they have already declined");
            }
        }

        private async Task<bool> HasPatientDeclinedSlotOverlapAsync(
            string patientId,
            Availability candidate,
            TimeSpan endTime)
        {
            var persistedConflict = await _appointmentRepository.HasDeclinedSlotOverlapAsync(
                patientId,
                candidate.Date,
                candidate.StartTime,
                endTime);
            if (persistedConflict)
                return true;

            // This fallback covers rows created before declined-slot history was
            // introduced and protects the migration window immediately.
            var patientAppointments = await _appointmentRepository.GetByPatientIdAsync(patientId);
            return patientAppointments.Any(appointment =>
                appointment.Status == "Cancelled" &&
                appointment.PatientResponseStatus == "Declined" &&
                appointment.Availability.Date.Date == candidate.Date.Date &&
                appointment.StartTime < endTime &&
                candidate.StartTime < appointment.EndTime);
        }

        private async Task ArchiveCompletedAppointmentSlotAsync(Appointment appointment)
        {
            if (appointment.Status != "Completed")
                return;

            MoveCompletedAppointmentToArchive(appointment);
            await _appointmentRepository.UpdateAsync(appointment);
        }

        private static void MoveCompletedAppointmentToArchive(Appointment appointment)
        {
            var availability = appointment.Availability;
            if (availability == null || availability.IsAppointmentArchive)
                return;

            appointment.Availability = new Availability
            {
                PersonnelId = availability.PersonnelId,
                Date = availability.Date,
                StartTime = appointment.StartTime,
                EndTime = appointment.EndTime,
                Notes = availability.Notes,
                IsAppointmentArchive = true
            };
            appointment.AvailabilityId = 0;
        }

        private static bool IsBlockingAppointment(Appointment appointment) =>
            appointment.Status is not ("Cancelled" or "Completed");

        private async Task<TimeSpan> ValidateScheduleAsync(
            Availability candidate,
            User patient,
            string tasks,
            int additionalDurationMinutes,
            int ignoredAppointmentId = 0)
        {
            return await TryGetScheduleEndTimeAsync(
                    candidate,
                    patient,
                    tasks,
                    additionalDurationMinutes,
                    ignoredAppointmentId)
                ?? throw new InvalidOperationException(
                    "The visit does not fit the nurse's availability, overlap, or travel-time requirements");
        }

        private async Task<TimeSpan?> TryGetScheduleEndTimeAsync(
            Availability candidate,
            User patient,
            string tasks,
            int additionalDurationMinutes,
            int ignoredAppointmentId = 0)
        {
            var durationMinutes = AppointmentSchedulingRules.CalculateDurationMinutes(
                tasks,
                additionalDurationMinutes);
            var endTime = candidate.StartTime.Add(TimeSpan.FromMinutes(durationMinutes));
            var window = candidate.AvailabilityWindow;
            var windowEnd = window?.EndTime ?? candidate.EndTime;

            if (window != null &&
                (!window.IsAvailable ||
                 window.PersonnelId != candidate.PersonnelId ||
                 window.Date.Date != candidate.Date.Date ||
                 candidate.StartTime < window.StartTime))
                return null;
            if (endTime > TimeSpan.FromDays(1) || endTime > windowEnd)
                return null;

            var nurseAppointments = (await _appointmentRepository.GetByPersonnelIdAndDateRangeAsync(
                    candidate.PersonnelId,
                    candidate.Date.Date,
                    candidate.Date.Date))
                .Where(appointment =>
                    appointment.Id != ignoredAppointmentId &&
                    IsBlockingAppointment(appointment))
                .OrderBy(appointment => appointment.StartTime)
                .ToList();

            if (nurseAppointments.Any(appointment =>
                appointment.StartTime < endTime && candidate.StartTime < appointment.EndTime))
                return null;

            var patientAppointments = await _appointmentRepository.GetByPatientIdAsync(patient.Id);
            if (patientAppointments.Any(appointment =>
                appointment.Id != ignoredAppointmentId &&
                IsBlockingAppointment(appointment) &&
                appointment.Availability.Date.Date == candidate.Date.Date &&
                appointment.StartTime < endTime &&
                candidate.StartTime < appointment.EndTime))
                return null;

            var previous = nurseAppointments
                .Where(appointment => appointment.EndTime <= candidate.StartTime)
                .LastOrDefault();
            if (previous != null)
            {
                var gapMinutes = (candidate.StartTime - previous.EndTime).TotalMinutes;
                var requiredMinutes = AppointmentSchedulingRules.EstimateTravelMinutes(
                    previous.Patient,
                    patient);
                if (gapMinutes < requiredMinutes)
                    return null;
            }

            var next = nurseAppointments.FirstOrDefault(appointment => appointment.StartTime >= endTime);
            if (next != null)
            {
                var gapMinutes = (next.StartTime - endTime).TotalMinutes;
                var requiredMinutes = AppointmentSchedulingRules.EstimateTravelMinutes(
                    patient,
                    next.Patient);
                if (gapMinutes < requiredMinutes)
                    return null;
            }

            return endTime;
        }

        private static AppointmentDto MapToDto(
            Appointment appointment)
        {
            var status = AppointmentStatusResolver.Resolve(
                appointment.Status,
                appointment.Availability.Date,
                appointment.EndTime,
                DateTime.Now);

            return new AppointmentDto
            {
                Id = appointment.Id,
                PatientId = appointment.PatientId,
                PatientName = appointment.Patient?.FullName ?? string.Empty,
                PatientAddress = appointment.Patient?.Address ?? string.Empty,
                PatientAccessInstructions = appointment.Patient?.AccessInstructions,
                PatientMedicationEquipmentNotes = appointment.Patient?.MedicationEquipmentNotes,
                PatientLatitude = appointment.Patient?.Latitude,
                PatientLongitude = appointment.Patient?.Longitude,
                PatientSupabaseProfileId = appointment.Patient?.SupabaseProfileId,
                AvailabilityId = appointment.AvailabilityId,
                PersonnelId = appointment.Availability?.PersonnelId ?? string.Empty,
                PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
                Date = appointment.Availability?.Date.ToString("yyyy-MM-dd") ?? string.Empty,
                Tasks = appointment.Tasks,
                AdditionalDurationMinutes = appointment.AdditionalDurationMinutes,
                AvailabilityNotes = appointment.Availability?.Notes ?? string.Empty,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = status,
                PatientResponseStatus = appointment.PatientResponseStatus,
                PatientRespondedAt = appointment.PatientRespondedAt,
                PatientProposedDate = appointment.PatientProposedDate?.ToString("yyyy-MM-dd"),
                PatientProposedStartTime = appointment.PatientProposedStartTime?.ToString(@"hh\:mm"),
                PatientProposedEndTime = appointment.PatientProposedEndTime?.ToString(@"hh\:mm"),
                VisitId = appointment.Visit?.Id,
                VisitStatus = appointment.Visit?.Status,
                VisitType = appointment.Visit?.VisitType
            };
        }

        private static bool IsOverlapConstraint(DbUpdateException exception) =>
            exception.InnerException is SqliteException sqliteException &&
            sqliteException.Message.Contains(
                "appointments cannot overlap",
                StringComparison.OrdinalIgnoreCase);
    }
}
