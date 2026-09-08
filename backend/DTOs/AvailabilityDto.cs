using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    public class AvailabilityDto
    {
        public int Id { get; set; }
        
        [Required]
        public string PersonnelId { get; set; } = string.Empty;
        
        public string? PersonnelName { get; set; }
        
        [Required]
        public string Date { get; set; } = string.Empty;
        
        [Required]
        public string StartTime { get; set; } = string.Empty;
        
        [Required]
        public string EndTime { get; set; } = string.Empty;
        
        public string? Notes { get; set; }
        
        public bool IsBooked { get; set; }
    }
}
