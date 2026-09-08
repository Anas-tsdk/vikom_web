using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    public class AvailabilitySlotDto
    {
        public int Id { get; set; }
        public string StartTime { get; set; } = string.Empty;
        public string EndTime { get; set; } = string.Empty;
        public bool IsBooked { get; set; }
    }

    public class AvailabilityWindowDto
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
        
        [Required]
        public bool IsAvailable { get; set; }
        
        public List<AvailabilitySlotDto> Slots { get; set; } = new();
    }

    public class CreateAvailabilityWindowDto
    {
        [Required]
        public string Date { get; set; } = string.Empty;
        
        public string? StartTime { get; set; }
        
        public string? EndTime { get; set; }
        
        public string? Notes { get; set; }
        
        [Required]
        public bool IsAvailable { get; set; }
    }

    public class UpdateAvailabilityWindowDto
    {
        [Required]
        public string Date { get; set; } = string.Empty;
        
        public string? StartTime { get; set; }
        
        public string? EndTime { get; set; }
        
        public string? Notes { get; set; }
        
        [Required]
        public bool IsAvailable { get; set; }
    }
}
