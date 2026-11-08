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
    public async Task Patient_confirmation_marks_today()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-3));

        var status = await _service.ConfirmByPatientAsync(patient);

        Assert.True(status.CheckedInToday);
        Assert.Equal("Patient", patient.LastDailyCheckInSource);
    }

    [Fact]
    public async Task Patient_confirmation_is_written_to_cloud_and_local_record()
    {
        var patient = AddPatient(lastCheckIn: _clock.UtcNow.AddDays(-1));
        var cloud = new FakeCloudStore();
        var service = new DailyCheckInService(_context, _clock, cloud);

        var status = await service.ConfirmByPatientAsync(patient);

        Assert.True(status.CheckedInToday);
        Assert.Equal((patient.SupabaseProfileId!, "Patient"), cloud.LastConfirmation);
        Assert.Equal("Patient", patient.LastDailyCheckInSource);
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
