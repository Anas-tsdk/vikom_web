using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Services
{
    public sealed record CloudDailyCheckIn(
        string ProfileId,
        DateTime StartedAt,
        DateTime? LastCheckInAt,
        string? LastCheckInSource);

    public interface ISupabaseDailyCheckInStore
    {
        bool IsConfigured { get; }
        Task<IReadOnlyDictionary<string, CloudDailyCheckIn>?> GetAllAsync(
            CancellationToken cancellationToken = default);
        Task<bool> ConfirmAsync(
            string profileId,
            string source,
            CancellationToken cancellationToken = default);
        Task SyncEligibilityAsync(
            IEnumerable<string> linkedProfileIds,
            CancellationToken cancellationToken = default);
        Task SyncPatientLinkAsync(
            string? previousProfileId,
            string? currentProfileId,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Service-role access to the Supabase check-in table shared by Android and
    /// the portal. No service credential is ever sent to either client.
    /// </summary>
    public sealed class SupabaseDailyCheckInStore : ISupabaseDailyCheckInStore
    {
        private const string Table = "patient_daily_check_ins";
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<SupabaseDailyCheckInStore> _logger;
        private readonly string? _supabaseUrl;
        private readonly string? _serviceRoleKey;

        public SupabaseDailyCheckInStore(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<SupabaseDailyCheckInStore> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _supabaseUrl = configuration["Supabase:Url"]
                ?? Environment.GetEnvironmentVariable("SUPABASE_URL");
            _serviceRoleKey = configuration["Supabase:ServiceRoleKey"]
                ?? Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");
        }

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(_supabaseUrl) &&
            !string.IsNullOrWhiteSpace(_serviceRoleKey);

        public async Task<IReadOnlyDictionary<string, CloudDailyCheckIn>?> GetAllAsync(
            CancellationToken cancellationToken = default)
        {
            if (!IsConfigured) return null;

            using var request = CreateRequest(
                HttpMethod.Get,
                $"{Table}?select=profile_id,started_at,last_check_in_at,last_check_in_source");

            try
            {
                using var response = await _httpClientFactory.CreateClient()
                    .SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    await LogFailureAsync("read", response, cancellationToken);
                    return null;
                }

                var rows = await response.Content.ReadFromJsonAsync<List<CloudRow>>(cancellationToken)
                    ?? new List<CloudRow>();
                return rows
                    .Where(row => Guid.TryParse(row.ProfileId, out _))
                    .ToDictionary(
                        row => row.ProfileId.ToLowerInvariant(),
                        row => new CloudDailyCheckIn(
                            row.ProfileId.ToLowerInvariant(),
                            row.StartedAt,
                            row.LastCheckInAt,
                            row.LastCheckInSource),
                        StringComparer.OrdinalIgnoreCase);
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
            {
                _logger.LogWarning(error, "Could not read cloud daily check-ins");
                return null;
            }
        }

        public async Task<bool> ConfirmAsync(
            string profileId,
            string source,
            CancellationToken cancellationToken = default)
        {
            var normalized = NormalizeProfileId(profileId);
            if (!IsConfigured || normalized == null) return false;

            var timestamp = DateTime.UtcNow;
            var payload = JsonSerializer.Serialize(new
            {
                last_check_in_at = timestamp,
                last_check_in_source = source,
                updated_at = timestamp
            });
            using var request = CreateRequest(
                HttpMethod.Patch,
                $"{Table}?profile_id=eq.{normalized}",
                payload);
            request.Headers.Add("Prefer", "return=representation");

            try
            {
                using var response = await _httpClientFactory.CreateClient()
                    .SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    await LogFailureAsync("confirm", response, cancellationToken);
                    return false;
                }

                var rows = await response.Content.ReadFromJsonAsync<List<CloudRow>>(cancellationToken);
                return rows?.Count == 1;
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
            {
                _logger.LogWarning(error, "Could not confirm cloud daily check-in for {ProfileId}", normalized);
                return false;
            }
        }

        public async Task SyncEligibilityAsync(
            IEnumerable<string> linkedProfileIds,
            CancellationToken cancellationToken = default)
        {
            if (!IsConfigured) return;

            var desired = linkedProfileIds
                .Select(NormalizeProfileId)
                .Where(id => id != null)
                .Select(id => id!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var current = await GetAllAsync(cancellationToken);
            if (current == null) return;

            foreach (var stale in current.Keys.Where(id => !desired.Contains(id)))
            {
                await DeleteAsync(stale, cancellationToken);
            }

            foreach (var missing in desired.Where(id => !current.ContainsKey(id)))
            {
                await UpsertAsync(missing, cancellationToken);
            }
        }

        public async Task SyncPatientLinkAsync(
            string? previousProfileId,
            string? currentProfileId,
            CancellationToken cancellationToken = default)
        {
            if (!IsConfigured) return;

            var previous = NormalizeProfileId(previousProfileId);
            var current = NormalizeProfileId(currentProfileId);
            if (previous != null && !string.Equals(previous, current, StringComparison.OrdinalIgnoreCase))
            {
                await DeleteAsync(previous, cancellationToken);
            }
            if (current != null)
            {
                await UpsertAsync(current, cancellationToken);
            }
        }

        private async Task<bool> UpsertAsync(string profileId, CancellationToken cancellationToken)
        {
            using var request = CreateRequest(
                HttpMethod.Post,
                $"{Table}?on_conflict=profile_id",
                JsonSerializer.Serialize(new { profile_id = profileId }));
            request.Headers.Add("Prefer", "resolution=merge-duplicates,return=minimal");
            return await SendMutationAsync("sync", profileId, request, cancellationToken);
        }

        private async Task<bool> DeleteAsync(string profileId, CancellationToken cancellationToken)
        {
            using var request = CreateRequest(
                HttpMethod.Delete,
                $"{Table}?profile_id=eq.{profileId}");
            return await SendMutationAsync("remove", profileId, request, cancellationToken);
        }

        private async Task<bool> SendMutationAsync(
            string operation,
            string profileId,
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            try
            {
                using var response = await _httpClientFactory.CreateClient()
                    .SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode) return true;
                await LogFailureAsync(operation, response, cancellationToken);
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
            {
                _logger.LogWarning(
                    error,
                    "Could not {Operation} cloud check-in eligibility for {ProfileId}",
                    operation,
                    profileId);
            }
            return false;
        }

        private HttpRequestMessage CreateRequest(HttpMethod method, string path, string? json = null)
        {
            var request = new HttpRequestMessage(
                method,
                $"{_supabaseUrl!.TrimEnd('/')}/rest/v1/{path}");
            request.Headers.Add("apikey", _serviceRoleKey!);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceRoleKey!);
            if (json != null)
            {
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }
            return request;
        }

        private async Task LogFailureAsync(
            string operation,
            HttpResponseMessage response,
            CancellationToken cancellationToken)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Supabase daily check-in {Operation} failed with {StatusCode}: {Body}. " +
                "Apply vikom_app-main/supabase/migrations/20260912_cloud_daily_check_ins.sql " +
                "if the table is missing.",
                operation,
                (int)response.StatusCode,
                body);
        }

        private static string? NormalizeProfileId(string? profileId) =>
            Guid.TryParse(profileId?.Trim(), out var parsed)
                ? parsed.ToString()
                : null;

        private sealed class CloudRow
        {
            [JsonPropertyName("profile_id")]
            public string ProfileId { get; set; } = string.Empty;

            [JsonPropertyName("started_at")]
            public DateTime StartedAt { get; set; }

            [JsonPropertyName("last_check_in_at")]
            public DateTime? LastCheckInAt { get; set; }

            [JsonPropertyName("last_check_in_source")]
            public string? LastCheckInSource { get; set; }
        }
    }
}
