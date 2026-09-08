using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// Represents a link between a patient and a secondary user (personnel or caregiver).
    /// </summary>
    public class PatientUserLink
    {
        public int Id { get; set; }

        [Required]
        public string PatientId { get; set; } = string.Empty;

        [ForeignKey("PatientId")]
        public User Patient { get; set; } = null!;

        [Required]
        public string SecondaryUserId { get; set; } = string.Empty;

        [ForeignKey("SecondaryUserId")]
        public User SecondaryUser { get; set; } = null!;

        [Required]
        [RegularExpression(@"^(Personnel|Relative)$", ErrorMessage = "RelationshipType must be 'Personnel' or 'Relative'.")]
        public string RelationshipType { get; set; } = "Personnel"; // "Personnel" or "Relative"
    }
}