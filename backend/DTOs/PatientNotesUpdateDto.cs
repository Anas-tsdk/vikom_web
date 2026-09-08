using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>
    /// Payload for updating a patient's free-text care note.
    /// </summary>
    public class PatientNotesUpdateDto
    {
        [StringLength(4000, ErrorMessage = "The note must be 4000 characters or fewer.")]
        public string? Notes { get; set; }
    }
}
