using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>
    /// Trusted staff provisioning request. Public self-registration deliberately
    /// uses RegisterDto instead and always creates a normal Nurse.
    /// </summary>
    public sealed class PersonnelRegistrationDto
    {
        [Required]
        public string UserName { get; set; } = string.Empty;

        [Required, EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string Password { get; set; } = string.Empty;

        [Required]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [RegularExpression(@"^(Nurse|HeadNurse)$", ErrorMessage = "Role must be Nurse or HeadNurse.")]
        public string Role { get; set; } = backend.Models.UserRoles.Nurse;

        public string? PhoneNumber { get; set; }
        public string? Address { get; set; }
    }
}
