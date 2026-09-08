namespace backend.DTOs
{
    /// <summary>
    /// The signed-in patient, as the TV app needs them.
    ///
    /// Deliberately not <see cref="UserDto"/>: that carries the address, the Supabase
    /// profile id and the role plumbing, none of which a greeting needs, and a device
    /// on a shared surface in someone's living room should receive the minimum.
    /// </summary>
    public class TvProfileDto
    {
        /// <summary>The patient's real name, e.g. "Ingrid Berg".</summary>
        public string FullName { get; set; } = string.Empty;

        /// <summary>The Supabase handle, e.g. "ingrid.berg". A fallback for display.</summary>
        public string UserName { get; set; } = string.Empty;
    }
}
