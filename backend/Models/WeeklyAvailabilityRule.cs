using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// A personnel member's recurring rule for one weekday. Dated
    /// AvailabilityWindows are materialized from these rules so appointments
    /// continue to book against real database slots.
    /// </summary>
    public class WeeklyAvailabilityRule
    {
        public int Id { get; set; }

        [Required]
        public string PersonnelId { get; set; } = string.Empty;

        [ForeignKey(nameof(PersonnelId))]
        public User? Personnel { get; set; }

        [Range(0, 6)]
        public int DayOfWeek { get; set; }

        public bool IsAvailable { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public string? Notes { get; set; }
    }
}
