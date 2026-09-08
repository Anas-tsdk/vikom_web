using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>
    /// Payload for updating the outcome/status of a logged call.
    /// </summary>
    public class CallLogUpdateDto
    {
        [Required(ErrorMessage = "Status is required.")]
        [RegularExpression(@"^(Initiated|Answered|Declined|Ended|Missed)$", ErrorMessage = "Invalid call status value.")]
        public string Status { get; set; } = string.Empty;
    }
}
