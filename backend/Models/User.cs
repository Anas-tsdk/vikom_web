using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace backend.Models
{
    /// <summary>
    /// Represents an application user, extending ASP.NET Identity's built-in IdentityUser.
    /// </summary>
    public class User : IdentityUser
    {
        [RegularExpression(@"^[\p{L}.\- ]+$", ErrorMessage = "The name must contain only letters, spaces, periods, or hyphens.")]
        [Display(Name = "Full Name")]
        public string FullName { get; set; } = string.Empty;

        [Display(Name = "Address")]
        public string? Address { get; set; }

        [Required(ErrorMessage = "Role is required.")]
        [RegularExpression(@"^(Personnel|Patient)$", ErrorMessage = "Role must be either 'Personnel' or 'Patient'.")]
        public string Role { get; set; } = string.Empty; // "Personnel" or "Patient"

        /// <summary>
        /// Optional: UUID from Supabase profiles.id for integration with Cart's TV app.
        /// Null if not yet mapped to a Supabase profile.
        /// </summary>
        [Display(Name = "Supabase Profile ID")]
        public string? SupabaseProfileId { get; set; }

        /// <summary>
        /// Human-readable handle (from the Supabase profile, e.g. "ingrid.berg")
        /// used in patient-detail URLs instead of the GUID id. Optional; the URL
        /// falls back to the id when absent. Named to avoid clashing with
        /// Identity's <c>UserName</c> (which is the login email).
        /// </summary>
        [Display(Name = "Profile Username")]
        public string? ProfileUsername { get; set; }

        /// <summary>
        /// Free-text care note that personnel can write and update for a patient.
        /// Null if no note has been written yet.
        /// </summary>
        [Display(Name = "Notes")]
        public string? Notes { get; set; }

        /// <summary>
        /// Timestamp (UTC) of the last time <see cref="Notes"/> was updated.
        /// </summary>
        public DateTime? NotesUpdatedAt { get; set; }

        // --- Patient clinical profile (read-only in the app for now) ---
        // These describe a patient's ongoing care record and are surfaced on the
        // Besøk workspace and the patient details page. Null/empty for personnel.

        public DateTime? DateOfBirth { get; set; }

        /// <summary>Next of kin / pårørende name (e.g. "Anne Berg").</summary>
        public string? NextOfKinName { get; set; }

        /// <summary>Relation of the next of kin (e.g. "datter").</summary>
        public string? NextOfKinRelation { get; set; }

        /// <summary>General practitioner / fastlege (e.g. "Dr. Lars Holm").</summary>
        public string? GeneralPractitioner { get; set; }

        /// <summary>Known allergies (free text, e.g. "Penicillin").</summary>
        public string? Allergies { get; set; }

        /// <summary>Comma-separated diagnoses (e.g. "Hypertensjon, Diabetes type 2").</summary>
        public string? Diagnoses { get; set; }

        /// <summary>Comma-separated condition flags (e.g. "Stabil tilstand, Mobil med rullator").</summary>
        public string? ConditionFlags { get; set; }

        /// <summary>Free-text treatment/care plan (Behandlingsplan).</summary>
        public string? TreatmentPlan { get; set; }

        /// <summary>Current medications for this patient.</summary>
        public ICollection<PatientMedication> Medications { get; set; } = new List<PatientMedication>();
    }
}
