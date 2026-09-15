using backend.DAL;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

public sealed class DailyCheckInTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;
    private readonly FakeClock _clock = new(new DateTime(2026, 9, 11, 10, 0, 0, DateTimeKind.Utc));
    private readonly DailyCheckInService _service;

    public DailyCheckInTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
        _context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options);
        _context.Database.EnsureCreated();
        _service = new DailyCheckInService(_context, _clock);
    }

    [Fact]
    public async Task Alert_appears_only_after_three_missed_care_days()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow);

        _clock.UtcNow = _clock.UtcNow.AddDays(2);
        Assert.Empty(await _service.GetAlertsAsync());

        _clock.UtcNow = _clock.UtcNow.AddDays(1);
        var alert = Assert.Single(await _service.GetAlertsAsync());
        Assert.Equal(patient.Id, alert.PatientId);
        Assert.Equal(3, alert.MissedDays);
    }

    [Fact]
    public async Task Patient_confirmation_marks_today_and_clears_alert()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-3));
        Assert.Single(await _service.GetAlertsAsync());

        var status = await _service.ConfirmByPatientAsync(patient);

        Assert.True(status.CheckedInToday);
        Assert.Equal("Patient", patient.LastDailyCheckInSource);
        Assert.Empty(await _service.GetAlertsAsync());
    }

    [Fact]
    public async Task Personnel_confirmation_is_audited_and_clears_alert()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-4));

        Assert.True(await _service.ConfirmByPersonnelAsync(patient.Id, "head-nurse"));

        Assert.Equal("Personnel", patient.LastDailyCheckInSource);
        Assert.Equal("head-nurse", patient.LastDailyCheckInConfirmedByUserId);
        Assert.Empty(await _service.GetAlertsAsync());
    }

    [Fact]
    public async Task Patients_with_check_ins_disabled_are_never_alerted()
    {
        AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-30), enabled: false);
        Assert.Empty(await _service.GetAlertsAsync());
    }

    [Fact]
    public async Task Cloud_confirmation_clears_a_stale_local_alert()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-5));
        var cloud = new FakeCloudStore(new CloudDailyCheckIn(
            patient.SupabaseProfileId!,
            _clock.UtcNow.AddDays(-30),
            _clock.UtcNow,
            "Patient"));
        var service = new DailyCheckInService(_context, _clock, cloud);

        Assert.Empty(await service.GetAlertsAsync());
    }

    [Fact]
    public async Task Missing_cloud_eligibility_row_does_not_gate_a_local_patient()
    {
        AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-5));
        var service = new DailyCheckInService(_context, _clock, new FakeCloudStore());

        Assert.Empty(await service.GetAlertsAsync());
    }

    [Fact]
    public async Task Personnel_confirmation_is_written_to_cloud_and_local_audit()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-5));
        var cloud = new FakeCloudStore(new CloudDailyCheckIn(
            patient.SupabaseProfileId!,
            _clock.UtcNow.AddDays(-30),
            _clock.UtcNow.AddDays(-5),
            "Patient"));
        var service = new DailyCheckInService(_context, _clock, cloud);

        Assert.True(await service.ConfirmByPersonnelAsync(patient.Id, "head-nurse"));
        Assert.Equal((patient.SupabaseProfileId!, "Personnel"), cloud.LastConfirmation);
        Assert.Equal("Personnel", patient.LastDailyCheckInSource);
    }

    private User AddPatient(DateTime? lastCheckIn, bool enabled = true)
    {
        var patient = new User
        {
            Id = Guid.NewGuid().ToString(),
            UserName = $"patient-{Guid.NewGuid()}@example.test",
            FullName = "Test Patient",
            Role = UserRoles.Patient,
            SupabaseProfileId = Guid.NewGuid().ToString(),
            DailyCheckInEnabled = enabled,
            DailyCheckInStartedAt = _clock.UtcNow.AddDays(-30),
            LastDailyCheckInAt = lastCheckIn
        };
        _context.Users.Add(patient);
        _context.SaveChanges();
        return patient;
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private sealed class FakeClock : ICheckInClock
    {
        public FakeClock(DateTime utcNow) => UtcNow = utcNow;
        public DateTime UtcNow { get; set; }
        public DateOnly CareDate(DateTime utcTimestamp) => DateOnly.FromDateTime(utcTimestamp);
    }

    private sealed class FakeCloudStore : ISupabaseDailyCheckInStore
    {
        private readonly IReadOnlyDictionary<string, CloudDailyCheckIn> _rows;

        public FakeCloudStore(params CloudDailyCheckIn[] rows) =>
            _rows = rows.ToDictionary(row => row.ProfileId, StringComparer.OrdinalIgnoreCase);

        public bool IsConfigured => true;
        public (string ProfileId, string Source)? LastConfirmation { get; private set; }

        public Task<IReadOnlyDictionary<string, CloudDailyCheckIn>?> GetAllAsync(
            CancellationToken cancellationToken = default) => Task.FromResult<
                IReadOnlyDictionary<string, CloudDailyCheckIn>?>(_rows);

        public Task<bool> ConfirmAsync(
            string profileId,
            string source,
            CancellationToken cancellationToken = default)
        {
            LastConfirmation = (profileId, source);
            return Task.FromResult(true);
        }

        public Task SyncEligibilityAsync(
            IEnumerable<string> linkedProfileIds,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task SyncPatientLinkAsync(
            string? previousProfileId,
            string? currentProfileId,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
