using backend.DTOs;

namespace backend.Services
{
    /// <summary>
    /// Why a result type rather than exceptions or a bare null: the three outcomes
    /// mean different things to the caller, and the controller maps each to its own
    /// status code. <see cref="NotConfigured"/> is a deployment problem (503), an
    /// invalid query is the caller's (400), and success may legitimately be empty.
    /// </summary>
    public enum SupabaseProfileLookupStatus
    {
        Success,

        /// <summary>No Supabase URL or no service-role key on the server.</summary>
        NotConfigured,

        /// <summary>The search term failed validation.</summary>
        InvalidQuery,

        /// <summary>Supabase was reachable but refused or failed the request.</summary>
        UpstreamError
    }

    public record SupabaseProfileLookupResult(
        SupabaseProfileLookupStatus Status,
        IReadOnlyList<SupabaseProfileDto> Profiles,
        string? Message = null)
    {
        public static SupabaseProfileLookupResult Ok(IReadOnlyList<SupabaseProfileDto> profiles) =>
            new(SupabaseProfileLookupStatus.Success, profiles);

        public static SupabaseProfileLookupResult Fail(SupabaseProfileLookupStatus status, string message) =>
            new(status, Array.Empty<SupabaseProfileDto>(), message);
    }

    /// <summary>
    /// Reads the Supabase <c>profiles</c> table on behalf of portal personnel.
    ///
    /// This exists so the browser never queries Supabase directly for patient
    /// identities. Portal users authenticate against this backend, not Supabase,
    /// so a browser-side lookup would have to run as <c>anon</c> — which would
    /// force <c>profiles</c> to allow anonymous SELECT and let anyone holding the
    /// (public) anon key enumerate patients. Going through here lets the read use
    /// a service-role key that stays on the server, so anonymous SELECT on
    /// <c>profiles</c> can stay revoked.
    /// </summary>
    public interface ISupabaseProfileDirectory
    {
        /// <summary>Profiles whose username contains <paramref name="query"/>.</summary>
        Task<SupabaseProfileLookupResult> SearchByUsernameAsync(string? query, int? limit, CancellationToken cancellationToken = default);

        /// <summary>Resolves a single profile by its UUID, for showing an existing link.</summary>
        Task<SupabaseProfileLookupResult> GetByIdAsync(string? profileId, CancellationToken cancellationToken = default);
    }
}
