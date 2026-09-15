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

        // A newly proposed time waits for the patient to answer in the TV app.
        // Appointment workflow remains separate: declining also cancels the slot,
        // while accepting keeps the appointment Booked.
        [RegularExpression(@"^(Pending|Accepted|Declined)$", ErrorMessage = "Invalid patient response status value.")]
        public string PatientResponseStatus { get; set; } = "Pending";

        public DateTime? PatientRespondedAt { get; set; }

        // Optional alternative supplied by the patient while declining. These
        // values are a planning request, not a booked slot; only staff can move
        // the appointment to a real Availability record.
        public DateTime? PatientProposedDate { get; set; }
        public TimeSpan? PatientProposedStartTime { get; set; }
        public TimeSpan? PatientProposedEndTime { get; set; }

        // The actual execution of this appointment (one-to-one). Null until a
        // nurse starts the visit.
        public Visit? Visit { get; set; }
    }
}
