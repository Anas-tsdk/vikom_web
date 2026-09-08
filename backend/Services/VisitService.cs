using backend.DTOs;
using backend.Models;
using backend.DAL.Repositories;

namespace backend.Services
{
    public class VisitService : IVisitService
    {
        private readonly IVisitRepository _visitRepository;
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly ICallLogRepository _callLogRepository;

        public VisitService(
            IVisitRepository visitRepository,
            IAppointmentRepository appointmentRepository,
            ICallLogRepository callLogRepository)
        {
            _visitRepository = visitRepository;
            _appointmentRepository = appointmentRepository;
            _callLogRepository = callLogRepository;
        }

        public async Task<VisitDto?> StartOrGetForAppointmentAsync(int appointmentId, string nurseId, string visitType)
        {
            // Idempotent: re-opening an appointment returns the visit already in
            // progress rather than creating a duplicate.
            var existing = await _visitRepository.GetByAppointmentIdAsync(appointmentId);
            if (existing != null)
            {
                return await BuildDtoAsync(existing);
            }

            var appointment = await _appointmentRepository.GetByIdAsync(appointmentId);
            if (appointment == null)
                throw new InvalidOperationException("Appointment not found");

            if (appointment.Status == "Cancelled")
                throw new InvalidOperationException("Cannot start a visit for a cancelled appointment");

            var visit = new Visit
            {
                AppointmentId = appointmentId,
                PatientId = appointment.PatientId,
                ResponsibleUserId = nurseId,
                VisitType = visitType,
                Status = "Active",
                StartedAt = DateTime.UtcNow,
                Tasks = BuildTasksFromAppointment(appointment.Tasks)
            };

            await _visitRepository.CreateAsync(visit);

            // Move the plan into execution. Leave already-progressed statuses be.
            if (appointment.Status == "Booked")
            {
                appointment.Status = "InProgress";
                await _appointmentRepository.UpdateAsync(appointment);
            }

            var created = await _visitRepository.GetByIdAsync(visit.Id);
            return await BuildDtoAsync(created!);
        }

        public async Task<VisitDto?> GetByIdAsync(int id)
        {
            var visit = await _visitRepository.GetByIdAsync(id);
            return visit == null ? null : await BuildDtoAsync(visit);
        }

        public async Task<VisitDto?> GetByAppointmentIdAsync(int appointmentId)
        {
            var visit = await _visitRepository.GetByAppointmentIdAsync(appointmentId);
            return visit == null ? null : await BuildDtoAsync(visit);
        }

        public async Task<IEnumerable<VisitSummaryDto>> GetByPatientIdAsync(string patientId)
        {
            var visits = await _visitRepository.GetByPatientIdAsync(patientId);
            var summaries = new List<VisitSummaryDto>();
            foreach (var visit in visits)
            {
                summaries.Add(await MapToSummaryAsync(visit));
            }
            return summaries;
        }

        public async Task<IEnumerable<VisitSummaryDto>> GetByResponsibleUserIdAsync(string nurseId)
        {
            var visits = await _visitRepository.GetByResponsibleUserIdAsync(nurseId);
            var summaries = new List<VisitSummaryDto>();
            foreach (var visit in visits)
            {
                // The archive is a record of documented visits; in-progress
                // visits aren't finished work, so leave them out.
                if (visit.Status == "Active") continue;
                summaries.Add(await MapToSummaryAsync(visit));
            }
            return summaries;
        }

        private async Task<VisitSummaryDto> MapToSummaryAsync(Visit visit)
        {
            var attempts = (await _callLogRepository.GetByVisitIdAsync(visit.Id)).ToList();
            return new VisitSummaryDto
            {
                Id = visit.Id,
                AppointmentId = visit.AppointmentId,
                PatientId = visit.PatientId,
                PatientName = visit.Patient?.FullName ?? string.Empty,
                Date = visit.Appointment?.Availability?.Date.ToString("yyyy-MM-dd"),
                StartTime = visit.Appointment?.StartTime.ToString(@"hh\:mm"),
                VisitType = visit.VisitType,
                Status = visit.Status,
                StartedAt = visit.StartedAt,
                EndedAt = visit.EndedAt,
                CompletedAt = visit.CompletedAt,
                OutcomeReason = visit.OutcomeReason,
                CallAttemptCount = attempts.Count,
                LastCallAttemptAt = attempts.Count > 0 ? attempts.Max(a => a.StartedAt) : null
            };
        }

        public async Task<VisitDto?> UpdateNotesAsync(int visitId, string? notes)
        {
            var visit = await _visitRepository.GetByIdAsync(visitId);
            if (visit == null) return null;

            visit.Notes = notes;
            await _visitRepository.UpdateAsync(visit);
            return await BuildDtoAsync(visit);
        }

        public async Task<VisitTaskDto?> AddTaskAsync(int visitId, string title)
        {
            var visit = await _visitRepository.GetByIdAsync(visitId);
            if (visit == null) return null;

            var task = new VisitTask
            {
                VisitId = visitId,
                Title = title.Trim(),
                Status = "Pending"
            };
            await _visitRepository.CreateTaskAsync(task);
            return MapTask(task);
        }

        public async Task<VisitTaskDto?> UpdateTaskAsync(int visitId, int taskId, string status, string? skippedReason)
        {
            var task = await _visitRepository.GetTaskByIdAsync(taskId);
            // Scope the update to the visit in the route so one visit's tasks
            // can't be mutated through another visit's endpoint.
            if (task == null || task.VisitId != visitId) return null;

            task.Status = status;
            switch (status)
            {
                case "Completed":
                    task.CompletedAt = DateTime.UtcNow;
                    task.SkippedReason = null;
                    break;
                case "Skipped":
                    task.SkippedReason = skippedReason;
                    task.CompletedAt = null;
                    break;
                default: // Pending
                    task.CompletedAt = null;
                    task.SkippedReason = null;
                    break;
            }

            await _visitRepository.UpdateTaskAsync(task);
            return MapTask(task);
        }

        public async Task<VisitDto?> CompleteAsync(int visitId, string? notes, bool followUpRequired)
        {
            var visit = await _visitRepository.GetByIdAsync(visitId);
            if (visit == null) return null;

            if (notes != null) visit.Notes = notes;
            visit.FollowUpRequired = followUpRequired;
            visit.Status = "Completed";
            visit.EndedAt = DateTime.UtcNow;
            visit.CompletedAt = DateTime.UtcNow;
            await _visitRepository.UpdateAsync(visit);

            await SetAppointmentStatusAsync(visit.AppointmentId, "Completed");
            return await BuildDtoAsync(visit);
        }

        public async Task<VisitDto?> CancelAsync(int visitId, string reason, string? notes)
        {
            var visit = await _visitRepository.GetByIdAsync(visitId);
            if (visit == null) return null;

            if (notes != null) visit.Notes = notes;
            visit.OutcomeReason = reason;
            visit.Status = "Incomplete";
            visit.EndedAt = DateTime.UtcNow;
            await _visitRepository.UpdateAsync(visit);

            await SetAppointmentStatusAsync(visit.AppointmentId, "NotCompleted");
            return await BuildDtoAsync(visit);
        }

        public async Task<CallLogDto?> LogCallAttemptAsync(int visitId, LogCallAttemptRequest request)
        {
            var visit = await _visitRepository.GetByIdAsync(visitId);
            if (visit == null) return null;

            var existing = (await _callLogRepository.GetByVisitIdAsync(visitId)).ToList();

            var callLog = new CallLog
            {
                PatientId = visit.PatientId,
                PersonnelId = visit.ResponsibleUserId,
                StartedAt = DateTime.UtcNow,
                Status = request.Status,
                VisitId = visitId,
                AppointmentId = visit.AppointmentId,
                AttemptNumber = existing.Count + 1,
                EndedAt = request.EndedAt,
                DurationSeconds = request.DurationSeconds,
                FailureReason = request.FailureReason
            };

            var created = await _callLogRepository.CreateAsync(callLog);
            var result = await _callLogRepository.GetByIdAsync(created.Id);
            return MapCall(result!);
        }

        // Directly drives the appointment status from the visit lifecycle; the
        // generic AppointmentService transition rules don't cover these.
        private async Task SetAppointmentStatusAsync(int appointmentId, string status)
        {
            var appointment = await _appointmentRepository.GetByIdAsync(appointmentId);
            if (appointment == null) return;
            appointment.Status = status;
            await _appointmentRepository.UpdateAsync(appointment);
        }

        private static List<VisitTask> BuildTasksFromAppointment(string tasks)
        {
            return (tasks ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(title => new VisitTask { Title = title, Status = "Pending" })
                .ToList();
        }

        private async Task<VisitDto> BuildDtoAsync(Visit visit)
        {
            var attempts = await _callLogRepository.GetByVisitIdAsync(visit.Id);
            var availability = visit.Appointment?.Availability;

            return new VisitDto
            {
                Id = visit.Id,
                AppointmentId = visit.AppointmentId,
                PatientId = visit.PatientId,
                PatientName = visit.Patient?.FullName ?? string.Empty,
                PatientAddress = visit.Patient?.Address,
                PatientPhone = visit.Patient?.PhoneNumber,
                SupabaseProfileId = visit.Patient?.SupabaseProfileId,
                ResponsibleUserId = visit.ResponsibleUserId,
                ResponsibleUserName = visit.ResponsibleUser?.FullName ?? string.Empty,
                VisitType = visit.VisitType,
                Status = visit.Status,
                StartedAt = visit.StartedAt,
                EndedAt = visit.EndedAt,
                CompletedAt = visit.CompletedAt,
                Notes = visit.Notes,
                FollowUpRequired = visit.FollowUpRequired,
                OutcomeReason = visit.OutcomeReason,
                Date = availability?.Date.ToString("yyyy-MM-dd"),
                StartTime = visit.Appointment?.StartTime.ToString(@"hh\:mm"),
                EndTime = visit.Appointment?.EndTime.ToString(@"hh\:mm"),
                Tasks = visit.Tasks
                    .OrderBy(t => t.Id)
                    .Select(MapTask)
                    .ToList(),
                CallAttempts = attempts.Select(MapCall).ToList(),
                PatientClinical = visit.Patient != null
                    ? PatientClinicalMapper.ToDto(visit.Patient)
                    : new PatientClinicalDto()
            };
        }

        private static VisitTaskDto MapTask(VisitTask task) => new()
        {
            Id = task.Id,
            VisitId = task.VisitId,
            Title = task.Title,
            Category = task.Category,
            Status = task.Status,
            SkippedReason = task.SkippedReason,
            CompletedAt = task.CompletedAt
        };

        private static CallLogDto MapCall(CallLog callLog) => new()
        {
            Id = callLog.Id,
            PatientId = callLog.PatientId,
            PersonnelId = callLog.PersonnelId,
            PersonnelName = callLog.Personnel?.FullName ?? string.Empty,
            StartedAt = callLog.StartedAt,
            Status = callLog.Status,
            VisitId = callLog.VisitId,
            AppointmentId = callLog.AppointmentId,
            AttemptNumber = callLog.AttemptNumber,
            EndedAt = callLog.EndedAt,
            DurationSeconds = callLog.DurationSeconds,
            FailureReason = callLog.FailureReason
        };
    }
}
