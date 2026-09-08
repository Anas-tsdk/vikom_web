using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using backend.DTOs;

namespace backend.Services
{
    /// <inheritdoc cref="ISupabaseProfileDirectory"/>
    public class SupabaseProfileDirectory : ISupabaseProfileDirectory
    {
        /// <summary>Only what the picker renders — never the whole row.</summary>
        private const string SelectColumns = "id,username,avatar_url,device_type,is_online";

        private const int DefaultLimit = 8;
        private const int MaxLimit = 25;
        private const int MinQueryLength = 2;
        private const int MaxQueryLength = 64;

        /// <summary>
        /// Whitelist rather than a blacklist. The term is interpolated into a
        /// PostgREST filter (<c>username=ilike.*term*</c>), where a comma would
        /// start a new filter and parentheses would open a logic tree, so anything
        /// outside letters, digits and these few separators is refused rather than
        /// escaped. Note <c>_</c> is a SQL LIKE single-character wildcard; it is
        /// allowed because it is common in usernames, and over-matching in a search
        /// box is harmless.
        /// </summary>
        private static readonly Regex AllowedQuery = new(@"^[\p{L}\p{N}._@-]+$", RegexOptions.Compiled);

        private static readonly Regex UuidPattern = new(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
            RegexOptions.Compiled);

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SupabaseProfileDirectory> _logger;

        public SupabaseProfileDirectory(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<SupabaseProfileDirectory> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        /// <summary>
        /// Trims and validates a search term. Returns null when it is unusable, so
        /// the caller can answer 400 without having contacted Supabase.
        /// Exposed for tests: this is the boundary that keeps a caller-supplied
        /// string from reshaping the PostgREST query.
        /// </summary>
        public static string? NormalizeQuery(string? query)
        {
            var trimmed = query?.Trim();

            if (string.IsNullOrEmpty(trimmed) ||
                trimmed.Length < MinQueryLength ||
                trimmed.Length > MaxQueryLength ||
                !AllowedQuery.IsMatch(trimmed))
            {
                return null;
            }

            return trimmed;
        }

        /// <summary>Clamps a caller-supplied page size into a sane range.</summary>
        public static int NormalizeLimit(int? limit) =>
            limit is null or < 1 ? DefaultLimit : Math.Min(limit.Value, MaxLimit);

        public async Task<SupabaseProfileLookupResult> SearchByUsernameAsync(
            string? query,
            int? limit,
            CancellationToken cancellationToken = default)
        {
            var term = NormalizeQuery(query);
            if (term == null)
            {
                return SupabaseProfileLookupResult.Fail(
                    SupabaseProfileLookupStatus.InvalidQuery,
                    $"Søket må være {MinQueryLength}–{MaxQueryLength} tegn og kan bare inneholde bokstaver, tall, punktum, understrek, bindestrek eller @.");
            }

            var escaped = Uri.EscapeDataString(term);

            return await QueryAsync(
                $"username=ilike.*{escaped}*&order=username&limit={NormalizeLimit(limit)}",
                cancellationToken);
        }

        public async Task<SupabaseProfileLookupResult> GetByIdAsync(
            string? profileId,
            CancellationToken cancellationToken = default)
        {
            var trimmed = profileId?.Trim();

            if (string.IsNullOrEmpty(trimmed) || !UuidPattern.IsMatch(trimmed))
            {
                return SupabaseProfileLookupResult.Fail(
                    SupabaseProfileLookupStatus.InvalidQuery,
                    "Supabase-profil-ID må være en UUID.");
            }

            // Lowercased to match how Supabase issues UUIDs, the same normalisation
            // PatientService applies before storing one.
            return await QueryAsync(
                $"id=eq.{Uri.EscapeDataString(trimmed.ToLowerInvariant())}&limit=1",
                cancellationToken);
        }

        private async Task<SupabaseProfileLookupResult> QueryAsync(
            string filter,
            CancellationToken cancellationToken)
        {
            var supabaseUrl = _configuration["Supabase:Url"]
                ?? Environment.GetEnvironmentVariable("SUPABASE_URL");

            // Service-role key only — deliberately no AnonKey fallback. Falling back
            // would keep working only while `profiles` allows anonymous SELECT, which
            // is exactly the exposure this class exists to remove.
            var serviceRoleKey = _configuration["Supabase:ServiceRoleKey"]
                ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");

            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(serviceRoleKey))
            {
                _logger.LogWarning(
                    "Supabase profile lookup is unavailable: Supabase:Url and/or Supabase:ServiceRoleKey is not configured.");

                return SupabaseProfileLookupResult.Fail(
                    SupabaseProfileLookupStatus.NotConfigured,
                    "Supabase-oppslag er ikke satt opp på serveren (mangler Supabase:ServiceRoleKey).");
            }

            var requestUri =
                $"{supabaseUrl.TrimEnd('/')}/rest/v1/profiles?select={SelectColumns}&{filter}";

            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
                request.Headers.Add("apikey", serviceRoleKey);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceRoleKey);

                var client = _httpClientFactory.CreateClient();
                using var response = await client.SendAsync(request, cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync(cancellationToken);

                    // The body can name the table and policy, so it is logged but not
                    // returned to the browser.
                    _logger.LogWarning(
                        "Supabase profile lookup failed with {StatusCode}: {Body}",
                        (int)response.StatusCode,
                        body);

                    return SupabaseProfileLookupResult.Fail(
                        SupabaseProfileLookupStatus.UpstreamError,
                        "Kunne ikke hente Supabase-profiler.");
                }

                var rows = await response.Content.ReadFromJsonAsync<List<ProfileRow>>(cancellationToken)
                    ?? new List<ProfileRow>();

                return SupabaseProfileLookupResult.Ok(rows.Select(Map).ToList());
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                _logger.LogWarning(ex, "Supabase profile lookup could not be completed");

                return SupabaseProfileLookupResult.Fail(
                    SupabaseProfileLookupStatus.UpstreamError,
                    "Kunne ikke nå Supabase.");
            }
        }

        private static SupabaseProfileDto Map(ProfileRow row) => new()
        {
            Id = row.Id,
            Username = row.Username,
            AvatarUrl = row.AvatarUrl,
            DeviceType = row.DeviceType,
            IsOnline = row.IsOnline ?? false
        };

        /// <summary>Snake-cased shape of a Supabase `profiles` row.</summary>
        private sealed class ProfileRow
        {
            [JsonPropertyName("id")]
            public string Id { get; set; } = string.Empty;

            [JsonPropertyName("username")]
            public string? Username { get; set; }

            [JsonPropertyName("avatar_url")]
            public string? AvatarUrl { get; set; }

            [JsonPropertyName("device_type")]
            public string? DeviceType { get; set; }

            [JsonPropertyName("is_online")]
            public bool? IsOnline { get; set; }
        }
    }
}
