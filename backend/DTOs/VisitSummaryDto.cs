namespace backend.DTOs
{
    /// <summary>
    /// Compact visit info for lists/history (e.g. a patient's visit history).
    /// </summary>
    public class VisitSummaryDto
    {
        public int Id { get; set; }
        public int AppointmentId { get; set; }
        public string PatientId { get; set; } = string.Empty;
        public string PatientName { get; set; } = string.Empty;
        /// <summary>Scheduled appointment date ("yyyy-MM-dd"), null if unavailable.</summary>
        public string? Date { get; set; }
        /// <summary>Scheduled appointment start time ("HH:mm"), null if unavailable.</summary>
        public string? StartTime { get; set; }
        public string VisitType { get; set; } = "Physical";
        public string Status { get; set; } = "Active";
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string? OutcomeReason { get; set; }
        public int CallAttemptCount { get; set; }
        public DateTime? LastCallAttemptAt { get; set; }
    }
}
