using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace backend.Services
{
    public class AppointmentService : IAppointmentService
    {
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AppointmentService> _logger;

        public AppointmentService(
            IAppointmentRepository appointmentRepository,
            IAvailabilityRepository availabilityRepository,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<AppointmentService> logger)
        {
            _appointmentRepository = appointmentRepository;
            _availabilityRepository = availabilityRepository;
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

            var appointment = new Appointment
            {
                PatientId = appointmentDto.PatientId,
                AvailabilityId = appointmentDto.AvailabilityId,
                Tasks = appointmentDto.Tasks,
                StartTime = availability.StartTime,
                EndTime = availability.EndTime,
                Status = "Booked"
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

            if (!string.IsNullOrEmpty(appointmentDto.Status) &&
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

            if (string.IsNullOrWhiteSpace(targetSupabaseProfileId))
            {
                _logger.LogInformation(
                    "Skipping appointment realtime event for appointment {AppointmentId} because no SupabaseProfileId was available",
                    appointment.Id);

                return;
            }

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
                    shortMessage:
                        string.IsNullOrWhiteSpace(appointment.Tasks)
                            ? "Appointment update"
                            : appointment.Tasks);

            var wrapper =
                AppointmentRealtimeEventService.BuildWrapper(
                    targetSupabaseProfileId,
                    payload);

            _logger.LogInformation(
                "Sending appointment realtime event for appointment {AppointmentId}, action {Action}, target {TargetSupabaseProfileId}",
                appointment.Id,
                action,
                targetSupabaseProfileId);

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

                var client =
                    _httpClientFactory.CreateClient();

                var request =
                    new HttpRequestMessage(
                        HttpMethod.Post,
                        $"{supabaseUrl.TrimEnd('/')}/realtime/v1/api/broadcast/webrtc-signaling/events/message");

                request.Content =
                    JsonContent.Create(wrapper);

                request.Headers.Add(
                    "apikey",
                    supabaseKey);

                request.Headers.Authorization =
                    new AuthenticationHeaderValue(
                        "Bearer",
                        supabaseKey);

                using var response =
                    await client.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation(
                        "Appointment realtime event sent successfully for appointment {AppointmentId} to {TargetSupabaseProfileId}",
                        appointment.Id,
                        targetSupabaseProfileId);

                    return;
                }

                var responseBody =
                    await response.Content.ReadAsStringAsync();

                _logger.LogWarning(
                    "Appointment realtime event failed for appointment {AppointmentId} with status {StatusCode}: {ResponseBody}",
                    appointment.Id,
                    response.StatusCode,
                    responseBody);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to send appointment realtime event for appointment {AppointmentId} to {TargetSupabaseProfileId}",
                    appointment.Id,
                    targetSupabaseProfileId);
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
VisitId = appointment.Visit?.Id,
VisitStatus = appointment.Visit?.Status,
VisitType = appointment.Visit?.VisitType
            };
        }
    }
}