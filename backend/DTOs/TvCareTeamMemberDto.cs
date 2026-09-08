namespace backend.DTOs
{
    /// <summary>
    /// One person on the patient's care team, as shown on the TV app.
    ///
    /// Read-only by design. Personnel have no Supabase profile, so they cannot be
    /// added as contacts or called from the tablet — this exists so a patient can see
    /// who looks after them and how to reach them by phone.
    /// </summary>
    public class TvCareTeamMemberDto
    {
        public string FullName { get; set; } = string.Empty;

        /// <summary>"Personnel" or "Relative" — from the patient-user link.</summary>
        public string RelationshipType { get; set; } = string.Empty;

        public string? PhoneNumber { get; set; }
    }
}
