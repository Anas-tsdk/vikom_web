using backend.DAL;
using backend.DTOs;
using backend.Models;

namespace backend.Services
{
    public interface ICheckInClock
    {
        DateTime UtcNow { get; }
        DateOnly CareDate(DateTime utcTimestamp);
    }

    /// <summary>Uses the configured care-service timezone, independent of server locale.</summary>
    public sealed class SystemCheckInClock : ICheckInClock
    {
        private readonly TimeZoneInfo _timeZone;

        public SystemCheckInClock(IConfiguration configuration, ILogger<SystemCheckInClock> logger)
        {
            var configured = configuration["CheckIns:TimeZone"] ?? "Europe/Oslo";
            _timeZone = Resolve(configured, logger);
        }

        public DateTime UtcNow => DateTime.UtcNow;

        public DateOnly CareDate(DateTime utcTimestamp)
        {
            var utc = utcTimestamp.Kind == DateTimeKind.Utc
                ? utcTimestamp
                : DateTime.SpecifyKind(utcTimestamp, DateTimeKind.Utc);
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, _timeZone));
        }

        private static TimeZoneInfo Resolve(string id, ILogger logger)
        {
            foreach (var candidate in new[] { id, "Europe/Oslo", "W. Europe Standard Time" }.Distinct())
            {
                try { return TimeZoneInfo.FindSystemTimeZoneById(candidate); }
                catch (TimeZoneNotFoundException) { }
                catch (InvalidTimeZoneException) { }
            }

            logger.LogWarning("Could not resolve check-in timezone {TimeZone}; falling back to UTC", id);
            return TimeZoneInfo.Utc;
        }
    }

    public interface IDailyCheckInService
    {
        DailyCheckInStatusDto GetStatus(User patient);
        Task<DailyCheckInStatusDto> ConfirmByPatientAsync(User patient);
    }

    public sealed class DailyCheckInService : IDailyCheckInService
    {
        private readonly ApplicationDbContext _context;
        private readonly ICheckInClock _clock;
        private readonly ISupabaseDailyCheckInStore? _cloudStore;

        public DailyCheckInService(
            ApplicationDbContext context,
            ICheckInClock clock,
            ISupabaseDailyCheckInStore? cloudStore = null)
        {
            _context = context;
            _clock = clock;
            _cloudStore = cloudStore;
        }

        public DailyCheckInStatusDto GetStatus(User patient)
        {
            var today = _clock.CareDate(_clock.UtcNow);
            return new DailyCheckInStatusDto
            {
                Required = patient.DailyCheckInEnabled,
                CheckedInToday = patient.LastDailyCheckInAt is DateTime last && _clock.CareDate(last) == today,
                LastCheckInAt = patient.LastDailyCheckInAt,
                LastCheckInSource = patient.LastDailyCheckInSource
            };
        }

        public async Task<DailyCheckInStatusDto> ConfirmByPatientAsync(User patient)
        {
            if (!patient.DailyCheckInEnabled)
            {
                return GetStatus(patient);
            }

            if (_cloudStore?.IsConfigured == true && patient.SupabaseProfileId != null)
            {
                var confirmed = await _cloudStore.ConfirmAsync(
                    patient.SupabaseProfileId,
                    "Patient");
                if (!confirmed)
                {
                    throw new InvalidOperationException(
                        "The daily check-in could not be saved to Supabase.");
                }
            }

            patient.DailyCheckInStartedAt ??= _clock.UtcNow;
            patient.LastDailyCheckInAt = _clock.UtcNow;
            patient.LastDailyCheckInSource = "Patient";
            patient.LastDailyCheckInConfirmedByUserId = null;
            await _context.SaveChangesAsync();
            return GetStatus(patient);
        }

    }
}
