namespace backend.DTOs
{
    /// <summary>
    /// A Supabase profile as shown in the portal's TV-link picker.
    ///
    /// Deliberately narrow: only the fields the picker renders. The portal reads
    /// these through the backend rather than from the browser, so nothing here
    /// travels with a key the frontend holds.
    /// </summary>
    public class SupabaseProfileDto
    {
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// The Supabase account's own username. Display-only: it is never stored
        /// as a patient's <c>ProfileUsername</c>, which is a separate local URL
        /// handle.
        /// </summary>
        public string? Username { get; set; }

        public string? AvatarUrl { get; set; }

        /// <summary>"tv" for a TV device, which is the one worth linking.</summary>
        public string? DeviceType { get; set; }

        public bool IsOnline { get; set; }
    }
}
