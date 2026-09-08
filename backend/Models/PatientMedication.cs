using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// A single current medication for a patient, shown in the
    /// "Gjeldende medisinering" module (name + dosage + schedule).
    /// </summary>
    public class PatientMedication
    {
        public int Id { get; set; }

        [Required]
        public string PatientId { get; set; } = string.Empty;

        [ForeignKey("PatientId")]
        public User Patient { get; set; } = null!;

        [Required]
        public string Name { get; set; } = string.Empty;

        // e.g. "500 mg"
        public string? Dosage { get; set; }

        // e.g. "2× daglig — morgen og kveld"
        public string? Schedule { get; set; }

        // Controls display order within the medication list.
        public int SortOrder { get; set; }
    }
}
