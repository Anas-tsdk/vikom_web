using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// The actual execution of a planned <see cref="Appointment"/>: when it
    /// started/ended, which tasks were done, what notes were written and the
    /// outcome. An appointment is the plan; a visit is what really happened.
    /// One visit per appointment.
    /// </summary>
    public class Visit
    {
        public int Id { get; set; }

        [Required]
        public int AppointmentId { get; set; }

        [ForeignKey("AppointmentId")]
        public Appointment Appointment { get; set; } = null!;

        [Required]
        public string PatientId { get; set; } = string.Empty;

        [ForeignKey("PatientId")]
        public User Patient { get; set; } = null!;

        // The nurse/personnel responsible for carrying out the visit.
        [Required]
        public string ResponsibleUserId { get; set; } = string.Empty;

        [ForeignKey("ResponsibleUserId")]
        public User ResponsibleUser { get; set; } = null!;

        [RegularExpression(@"^(Physical|Digital)$", ErrorMessage = "Invalid visit type value.")]
        public string VisitType { get; set; } = "Physical";

        // Active = in progress, Completed = finished successfully,
        // Incomplete = could not be completed (with a reason), Cancelled.
        [RegularExpression(@"^(Active|Completed|Incomplete|Cancelled)$", ErrorMessage = "Invalid visit status value.")]
        public string Status { get; set; } = "Active";

        public DateTime StartedAt { get; set; }

        public DateTime? EndedAt { get; set; }

        public DateTime? CompletedAt { get; set; }

        public string? Notes { get; set; }

        public bool FollowUpRequired { get; set; }

        // Reason the visit was marked incomplete/cancelled (free text or a
        // chosen reason such as "Pasienten svarte ikke").
        public string? OutcomeReason { get; set; }

        public ICollection<VisitTask> Tasks { get; set; } = new List<VisitTask>();
    }
}
