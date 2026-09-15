using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Globalization;

namespace backend.Services
{
    public class AppointmentService : IAppointmentService
    {
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IUserRepository _userRepository;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AppointmentService> _logger;

        public AppointmentService(
            IAppointmentRepository appointmentRepository,
            IAvailabilityRepository availabilityRepository,
            IUserRepository userRepository,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<AppointmentService> logger)
        {
            _appointmentRepository = appointmentRepository;
            _availabilityRepository = availabilityRepository;
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
            var availability = await _availabilityRepository.GetByIdAsync(appointmentDto.AvailabilityId);

            if (availability == null)
            {
                throw new InvalidOperationException("Availability not found");
            }

            if (availability.Appointment != null)
            {
                throw new InvalidOperationException("Availability slot is already booked");
            }

            var appointmentDateTime =
                availability.Date.Date + availability.StartTime;

            if (appointmentDateTime <= DateTime.Now)
            {
                throw new InvalidOperationException(
                    "Cannot book appointments in the past");
            }

            await EnsurePatientHasNotDeclinedSlotAsync(
                appointmentDto.PatientId,
                availability);

            var appointment = new Appointment
            {
                PatientId = appointmentDto.PatientId,
                AvailabilityId = appointmentDto.AvailabilityId,
                Tasks = appointmentDto.Tasks,
                StartTime = availability.StartTime,
                EndTime = availability.EndTime,
                Status = "Booked",
                PatientResponseStatus = "Pending"
            };

            var created =
                await _appointmentRepository.CreateAsync(appointment);

            var result =
                await _appointmentRepository.GetByIdAsync(created.Id);

            if (result != null)
            {
                await EmitAppointmentRealtimeEventAsync(
                    result,
                    "created");
            }

            return MapToDto(result!);
        }

        public async Task<AppointmentDto> UpdateAsync(
            int id,
            AppointmentDto appointmentDto)
        {
            var existing =
                await _appointmentRepository.GetByIdAsync(id);

            if (existing == null)
            {
                throw new InvalidOperationException(
                    "Appointment not found");
            }

            var updated = false;
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
                if (newAvailability.Appointment != null && newAvailability.Appointment.Id != existing.Id)
                    throw new InvalidOperationException("Availability slot is already booked");
                if (newAvailability.Date.Date + newAvailability.StartTime <= DateTime.Now)
                    throw new InvalidOperationException("Cannot book appointments in the past");

                await EnsurePatientHasNotDeclinedSlotAsync(
                    existing.PatientId,
                    newAvailability);

                existing.AvailabilityId = newAvailability.Id;
                existing.Availability = newAvailability;
                existing.StartTime = newAvailability.StartTime;
                existing.EndTime = newAvailability.EndTime;
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
                updated = true;
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

        public async Task<AppointmentDto?> RespondToInvitationAsync(
            int id,
            string patientId,
            string response,
            string? proposedDate = null,
            string? proposedStartTime = null,
            string? proposedEndTime = null)
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
            Availability candidate)
        {
            var persistedConflict = await _appointmentRepository.HasDeclinedSlotOverlapAsync(
                patientId,
                candidate.Date,
                candidate.StartTime,
                candidate.EndTime);
            if (persistedConflict)
            {
                throw new InvalidOperationException(
                    "Cannot schedule a patient in a time range they have already declined");
            }

            // This fallback covers rows created before declined-slot history was
            // introduced and protects the migration window immediately.
            var patientAppointments = await _appointmentRepository.GetByPatientIdAsync(patientId);
            var legacyConflict = patientAppointments.Any(appointment =>
                appointment.Status == "Cancelled" &&
                appointment.PatientResponseStatus == "Declined" &&
                appointment.Availability.Date.Date == candidate.Date.Date &&
                appointment.StartTime < candidate.EndTime &&
                candidate.StartTime < appointment.EndTime);

            if (legacyConflict)
            {
                throw new InvalidOperationException(
                    "Cannot schedule a patient in a time range they have already declined");
            }
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
PatientLatitude = appointment.Patient?.Latitude,
PatientLongitude = appointment.Patient?.Longitude,
PatientSupabaseProfileId = appointment.Patient?.SupabaseProfileId,
AvailabilityId = appointment.AvailabilityId,
PersonnelId = appointment.Availability?.PersonnelId ?? string.Empty,
PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
Date = appointment.Availability?.Date.ToString("yyyy-MM-dd") ?? string.Empty,
Tasks = appointment.Tasks,
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
    }
}
