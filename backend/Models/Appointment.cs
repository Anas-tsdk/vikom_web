using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    public class Appointment
    {
        public int Id { get; set; }

        [Required]
        public string PatientId { get; set; } = string.Empty;

        [ForeignKey("PatientId")]
        public User Patient { get; set; } = null!;

        [Required]
        public int AvailabilityId { get; set; }

        [ForeignKey("AvailabilityId")]
        public Availability Availability { get; set; } = null!;

        // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
        [Required(ErrorMessage = "At least one task is required.")]
        public string Tasks { get; set; } = string.Empty;

        [DataType(DataType.Time)]
        public TimeSpan StartTime { get; set; }

        [DataType(DataType.Time)]
        public TimeSpan EndTime { get; set; }

        [RegularExpression(@"^(Booked|InProgress|Completed|NotCompleted|Cancelled)$", ErrorMessage = "Invalid status value.")]
        public string Status { get; set; } = "Booked";

        // The actual execution of this appointment (one-to-one). Null until a
        // nurse starts the visit.
        public Visit? Visit { get; set; }
    }
}
