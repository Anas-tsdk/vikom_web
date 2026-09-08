using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// Records a call placed from a personnel user to a patient's TV profile
    /// (the "Ring pasient" feature). Used to surface a communication history.
    /// </summary>
    public class CallLog
    {
        public int Id { get; set; }

        [Required]
        public string PatientId { get; set; } = string.Empty;

        [ForeignKey("PatientId")]
        public User Patient { get; set; } = null!;

        [Required]
        public string PersonnelId { get; set; } = string.Empty;

        [ForeignKey("PersonnelId")]
        public User Personnel { get; set; } = null!;

        public DateTime StartedAt { get; set; }

        // "Initiated", "Answered", "Declined", "Ended", "Missed", "Failed"
        [RegularExpression(@"^(Initiated|Answered|Declined|Ended|Missed|Failed)$", ErrorMessage = "Invalid call status value.")]
        public string Status { get; set; } = "Initiated";

        // Optional link to the visit this call attempt belongs to. A plain
        // "Ring pasient" from the patient page leaves these null; a call placed
        // during a digital visit carries the visit/appointment + attempt number.
        public int? VisitId { get; set; }

        [ForeignKey("VisitId")]
        public Visit? Visit { get; set; }

        public int? AppointmentId { get; set; }

        // 1-based position of this attempt within its visit (null for non-visit calls).
        public int? AttemptNumber { get; set; }

        public DateTime? EndedAt { get; set; }

        public int? DurationSeconds { get; set; }

        // Reason a call attempt failed/ended without success (e.g. technical issue).
        public string? FailureReason { get; set; }
    }
}
