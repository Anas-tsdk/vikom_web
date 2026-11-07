using backend.DTOs;
using backend.Models;

namespace backend.Services;

internal static class AppointmentSummaryMapper
{
    internal static AppointmentSummaryDto Map(
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
