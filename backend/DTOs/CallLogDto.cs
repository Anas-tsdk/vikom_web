namespace backend.DTOs
{
    public class CallLogDto
    {
        public int Id { get; set; }
        public string PatientId { get; set; } = string.Empty;
        public string PersonnelId { get; set; } = string.Empty;
        public string PersonnelName { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public string Status { get; set; } = string.Empty;

        // Visit-scoped call attempt fields (null for plain "Ring pasient" calls).
        public int? VisitId { get; set; }
        public int? AppointmentId { get; set; }
        public int? AttemptNumber { get; set; }
        public DateTime? EndedAt { get; set; }
        public int? DurationSeconds { get; set; }
        public string? FailureReason { get; set; }
    }
}
