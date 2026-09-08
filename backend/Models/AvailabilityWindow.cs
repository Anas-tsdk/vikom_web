using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    public class AvailabilityWindow
    {
        public int Id { get; set; }

        [Required]
        public string PersonnelId { get; set; } = string.Empty;

        [ForeignKey("PersonnelId")]
        public User? Personnel { get; set; }

        [Required, DataType(DataType.Date)]
        [DisplayFormat(DataFormatString = "{0:yyyy-MM-dd}", ApplyFormatInEditMode = true)]
        public DateTime Date { get; set; } = DateTime.Today;

        [Required, DataType(DataType.Time)]
        [DisplayFormat(DataFormatString = "{0:hh\\:mm}", ApplyFormatInEditMode = true)]
        public TimeSpan StartTime { get; set; }

        [Required, DataType(DataType.Time)]
        [DisplayFormat(DataFormatString = "{0:hh\\:mm}", ApplyFormatInEditMode = true)]
        public TimeSpan EndTime { get; set; }

        public string? Notes { get; set; }

        [Required]
        public bool IsAvailable { get; set; } = true;

        // Navigation property to generated slots
        public List<Availability> Slots { get; set; } = new();
    }
}
