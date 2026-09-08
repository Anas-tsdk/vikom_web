using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    public class UserDto
    {
        public string? Id { get; set; }
        
        [Required]
        public string UserName { get; set; } = string.Empty;
        
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;
        
        [Required]
        public string FullName { get; set; } = string.Empty;
        
        [Required]
        [RegularExpression(@"^(Personnel|Patient)$", ErrorMessage = "Role must be either 'Personnel' or 'Patient'.")]
        public string Role { get; set; } = string.Empty;
        
        public string? PhoneNumber { get; set; }

        public string? Address { get; set; }

        /// <summary>
        /// Optional Supabase profile ID for integration. Null if not mapped.
        /// </summary>
        public string? SupabaseProfileId { get; set; }
    }
}
