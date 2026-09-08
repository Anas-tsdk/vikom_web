using System.ComponentModel.DataAnnotations;

namespace backend.DTOs
{
    /// <summary>
    /// Payload for registering a new patient from the portal.
    ///
    /// The Supabase fields are optional: a patient can be created first and linked
    /// to their TV identity later through <see cref="PatientUpdateDto"/>.
    /// </summary>
    public class PatientCreateDto
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

        /// <summary>
        /// UUID of the patient's Supabase profile, which is what lets the TV app
        /// resolve them. Empty means "not linked yet".
        /// </summary>
        // The empty alternative keeps a blank field valid: the form always posts
        // the input, and "" means "no link" rather than a malformed one.
        [RegularExpression(
            @"^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
            ErrorMessage = "Supabase profile ID must be a UUID.")]
        public string? SupabaseProfileId { get; set; }

        // No ProfileUsername here on purpose. That column is the *local* URL
        // handle behind /patients/{username}, not the Supabase username, and it
        // is owned by the seeder. Patients registered here leave it null and are
        // addressed by their GUID, so a Supabase link can never rename a patient's
        // URL or collide with another patient's handle.
    }
}
