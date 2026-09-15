using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    public class AppointmentResponseRequest
    {
        [Required]
        [RegularExpression(@"^(Accepted|Declined)$", ErrorMessage = "Response must be Accepted or Declined.")]
        public string Response { get; set; } = string.Empty;

        [RegularExpression(@"^\d{4}-\d{2}-\d{2}$", ErrorMessage = "ProposedDate must use yyyy-MM-dd format.")]
        public string? ProposedDate { get; set; }

        [RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d$", ErrorMessage = "ProposedStartTime must use HH:mm format.")]
        public string? ProposedStartTime { get; set; }

        [RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d$", ErrorMessage = "ProposedEndTime must use HH:mm format.")]
        public string? ProposedEndTime { get; set; }
    }
}
