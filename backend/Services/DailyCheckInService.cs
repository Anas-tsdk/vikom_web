using backend.DAL;
using backend.DTOs;
using backend.Models;
using Microsoft.EntityFrameworkCore;

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
        Task<IReadOnlyList<DailyCheckInAlertDto>> GetAlertsAsync();
        Task<bool> ConfirmByPersonnelAsync(string patientId, string personnelId);
    }

    public sealed class DailyCheckInService : IDailyCheckInService
    {
        public const int AlertAfterMissedDays = 3;

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

        public async Task<IReadOnlyList<DailyCheckInAlertDto>> GetAlertsAsync()
        {
            var patients = await _context.Users
                .AsNoTracking()
                .Where(user =>
                    user.Role == UserRoles.Patient &&
                    user.DailyCheckInEnabled &&
                    user.SupabaseProfileId != null)
                .ToListAsync();

            var cloudRows = _cloudStore?.IsConfigured == true
                ? await _cloudStore.GetAllAsync()
                : null;

            return patients
                .Select(patient =>
                {
                    CloudDailyCheckIn? cloud = null;
                    if (cloudRows != null)
                    {
                        cloudRows.TryGetValue(patient.SupabaseProfileId!, out cloud);
                    }

                    // A successful cloud read makes the Supabase table the source
                    // of truth. If its row is absent, this account is not gated.
                    var isEligible = cloudRows == null || cloud != null;
                    var lastCheckIn = cloud?.LastCheckInAt ?? patient.LastDailyCheckInAt;
                    var baseline = cloud != null
                        ? cloud.LastCheckInAt ?? cloud.StartedAt
                        : patient.LastDailyCheckInAt ?? patient.DailyCheckInStartedAt;

                    return new
                    {
                        Patient = patient,
                        IsEligible = isEligible,
                        LastCheckIn = lastCheckIn,
                        MissedDays = CalculateMissedDays(baseline)
                    };
                })
                .Where(item => item.IsEligible)
                .Where(item => item.MissedDays >= AlertAfterMissedDays)
                .OrderByDescending(item => item.MissedDays)
                .ThenBy(item => item.Patient.FullName)
                .Select(item => new DailyCheckInAlertDto
                {
                    PatientId = item.Patient.Id,
                    PatientName = item.Patient.FullName,
                    PhoneNumber = item.Patient.PhoneNumber,
                    Address = item.Patient.Address,
                    LastCheckInAt = item.LastCheckIn,
                    MissedDays = item.MissedDays
                })
                .ToList();
        }

        public async Task<bool> ConfirmByPersonnelAsync(string patientId, string personnelId)
        {
            var patient = await _context.Users.FirstOrDefaultAsync(user =>
                user.Id == patientId &&
                user.Role == UserRoles.Patient &&
                user.DailyCheckInEnabled);
            if (patient == null) return false;

            if (_cloudStore?.IsConfigured == true && patient.SupabaseProfileId != null)
            {
                var confirmed = await _cloudStore.ConfirmAsync(
                    patient.SupabaseProfileId,
                    "Personnel");
                if (!confirmed) return false;
            }

            patient.LastDailyCheckInAt = _clock.UtcNow;
            patient.LastDailyCheckInSource = "Personnel";
            patient.LastDailyCheckInConfirmedByUserId = personnelId;
            patient.DailyCheckInStartedAt ??= _clock.UtcNow;
            await _context.SaveChangesAsync();
            return true;
        }

        private int CalculateMissedDays(DateTime? baseline)
        {
            if (baseline == null) return 0;
            return Math.Max(0, _clock.CareDate(_clock.UtcNow).DayNumber - _clock.CareDate(baseline.Value).DayNumber);
        }
    }
}
