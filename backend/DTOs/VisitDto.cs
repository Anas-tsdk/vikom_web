namespace backend.DTOs
{
    /// <summary>
    /// Full visit detail returned to the Besøk workspace and the read-only
    /// visit-details view: visit state plus the related appointment context,
    /// its tasks and any digital call attempts.
    /// </summary>
    public class VisitDto
    {
        public int Id { get; set; }
        public int AppointmentId { get; set; }

        public string PatientId { get; set; } = string.Empty;
        public string PatientName { get; set; } = string.Empty;
        public string? PatientAddress { get; set; }
        public string? PatientPhone { get; set; }
        public string? SupabaseProfileId { get; set; }

        public string ResponsibleUserId { get; set; } = string.Empty;
        public string ResponsibleUserName { get; set; } = string.Empty;

        public string VisitType { get; set; } = "Physical";
        public string Status { get; set; } = "Active";

        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public string? Notes { get; set; }
        public bool FollowUpRequired { get; set; }
        public string? OutcomeReason { get; set; }

        // Appointment context (date is "yyyy-MM-dd", times are "HH:mm").
        public string? Date { get; set; }
        public string? StartTime { get; set; }
        public string? EndTime { get; set; }

        public List<VisitTaskDto> Tasks { get; set; } = new();
        public List<CallLogDto> CallAttempts { get; set; } = new();

        // Read-only clinical profile of the patient (overview, diagnoses,
        // medications, treatment plan) shown in the workspace.
        public PatientClinicalDto PatientClinical { get; set; } = new();
    }
}
