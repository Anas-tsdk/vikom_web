using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>
    /// Payload for updating a patient's contact details.
    /// </summary>
    public class PatientUpdateDto
    {
        [Required(ErrorMessage = "Full name is required.")]
        [RegularExpression(@"^[\p{L}.\- ]+$", ErrorMessage = "The name must contain only letters, spaces, periods, or hyphens.")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email is required.")]
        [EmailAddress(ErrorMessage = "Invalid email address.")]
        public string Email { get; set; } = string.Empty;

        [Phone(ErrorMessage = "Invalid phone number.")]
        public string? PhoneNumber { get; set; }

        public string? Address { get; set; }
        [StringLength(64)]
        public string? SocialSecurityNumber { get; set; }
        [Range(-90, 90)] public double? Latitude { get; set; }
        [Range(-180, 180)] public double? Longitude { get; set; }

        public DateTime? DateOfBirth { get; set; }
        public string? NextOfKinName { get; set; }
        public string? NextOfKinRelation { get; set; }
        public string? GeneralPractitioner { get; set; }
        public string? Allergies { get; set; }
        public string? AccessInstructions { get; set; }
        public string? MedicationEquipmentNotes { get; set; }
        public List<string> Diagnoses { get; set; } = new();
        public List<string> ConditionFlags { get; set; } = new();
        public string? TreatmentPlan { get; set; }
        public List<MedicationDto> Medications { get; set; } = new();

        /// <summary>
        /// UUID of the patient's Supabase profile. Empty clears the link, which
        /// makes the TV app stop resolving this patient.
        /// </summary>
        // The empty alternative keeps a blank field valid: the form always posts
        // the input, and "" means "no link" rather than a malformed one.
        [RegularExpression(
            @"^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
            ErrorMessage = "Supabase profile ID must be a UUID.")]
        public string? SupabaseProfileId { get; set; }

        // No ProfileUsername here on purpose. Linking, relinking or unlinking a
        // Supabase account must change only SupabaseProfileId — the local URL
        // handle is not the Supabase username, and rewriting it here would rename
        // the patient's URL mid-session and could collide with another patient's
        // handle on IX_AspNetUsers_ProfileUsername.
    }
}
