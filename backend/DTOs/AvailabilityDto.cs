using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    public class AvailabilityDto
    {
        public int Id { get; set; }
        
        // Optional on writes: the server uses the caller for normal nurses and
        // permits a HeadNurse to select another nurse explicitly.
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
