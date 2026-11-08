using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    public class Availability
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

        public bool IsAppointmentArchive { get; set; }

        // Parent window reference
        public int? AvailabilityWindowId { get; set; }
        
        [ForeignKey("AvailabilityWindowId")]
        public AvailabilityWindow? AvailabilityWindow { get; set; }

        // Booking reference
        public Appointment? Appointment { get; set; }
    }
}
