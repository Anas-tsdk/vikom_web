using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>Request bodies for the visit lifecycle endpoints.</summary>

    public class StartVisitRequest
    {
        [Required]
        public int AppointmentId { get; set; }

        [RegularExpression(@"^(Physical|Digital)$", ErrorMessage = "Invalid visit type value.")]
        public string VisitType { get; set; } = "Physical";
    }

    public class UpdateVisitNotesRequest
    {
        public string? Notes { get; set; }
    }

    public class AddVisitTaskRequest
    {
        [Required]
        public string Title { get; set; } = string.Empty;
    }

    public class UpdateVisitTaskRequest
    {
        [Required]
        [RegularExpression(@"^(Pending|Completed|Skipped)$", ErrorMessage = "Invalid task status value.")]
        public string Status { get; set; } = "Pending";

        public string? SkippedReason { get; set; }
    }

    public class CompleteVisitRequest
    {
        public string? Notes { get; set; }
        public bool FollowUpRequired { get; set; }
    }

    public class CancelVisitRequest
    {
        [Required]
        public string Reason { get; set; } = string.Empty;

        public string? Notes { get; set; }
    }

    public class LogCallAttemptRequest
    {
        [RegularExpression(@"^(Initiated|Answered|Declined|Ended|Missed|Failed)$", ErrorMessage = "Invalid call status value.")]
        public string Status { get; set; } = "Initiated";

        public DateTime? EndedAt { get; set; }
        public int? DurationSeconds { get; set; }
        public string? FailureReason { get; set; }
    }
}
