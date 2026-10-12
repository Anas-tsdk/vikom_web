using backend.DAL;
using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

public sealed class AvailabilityScheduleTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;
    private readonly AvailabilityService _service;
    private readonly string _personnelId;

    public AvailabilityScheduleTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(_connection).Options);
        _context.Database.EnsureCreated();

        var personnel = new User
        {
            Id = Guid.NewGuid().ToString(),
            UserName = "schedule.nurse@example.test",
            NormalizedUserName = "SCHEDULE.NURSE@EXAMPLE.TEST",
            Email = "schedule.nurse@example.test",
            NormalizedEmail = "SCHEDULE.NURSE@EXAMPLE.TEST",
            FullName = "Schedule Nurse",
            Role = "Personnel",
        };
        _context.Users.Add(personnel);
        _context.SaveChanges();
        _personnelId = personnel.Id;

        _service = new AvailabilityService(
            new AvailabilityRepository(_context),
            new AvailabilityWindowRepository(_context),
            new AppointmentRepository(_context),
            _context);
    }

    [Fact]
    public async Task New_schedule_defaults_to_weekdays_from_nine_to_seventeen()
    {
        var rules = await _service.GetWeeklyScheduleAsync(_personnelId);

        Assert.Equal(7, rules.Count);
        Assert.All(rules.Where(rule => rule.DayOfWeek is >= 1 and <= 5), rule =>
        {
            Assert.True(rule.IsAvailable);
            Assert.Equal("09:00", rule.StartTime);
            Assert.Equal("17:00", rule.EndTime);
        });
        Assert.All(rules.Where(rule => rule.DayOfWeek is 0 or 6), rule => Assert.False(rule.IsAvailable));
    }

    [Fact]
    public async Task Blank_times_create_a_real_nine_to_seventeen_window_and_slots()
    {
        var monday = Next(DayOfWeek.Monday);
        var created = await _service.CreateWindowAsync(_personnelId, new CreateAvailabilityWindowDto
        {
            Date = monday.ToString("yyyy-MM-dd"),
            IsAvailable = true,
            StartTime = "",
            EndTime = "",
        });

        Assert.Equal("09:00", created.StartTime);
        Assert.Equal("17:00", created.EndTime);
        Assert.Equal(32, created.Slots.Count);
        Assert.Equal("09:00", created.Slots[0].StartTime);
        Assert.Equal("09:15", created.Slots[1].StartTime);
        Assert.Equal(1, await _context.AvailabilityWindows.CountAsync(window =>
            window.PersonnelId == _personnelId && window.Date == monday));
    }

    [Fact]
    public async Task Manual_day_override_survives_a_weekly_schedule_change()
    {
        var monday = Next(DayOfWeek.Monday);
        await _service.GetDayAvailabilityAsync(_personnelId, monday);
        await _service.CreateWindowAsync(_personnelId, new CreateAvailabilityWindowDto
        {
            Date = monday.ToString("yyyy-MM-dd"),
            IsAvailable = true,
            StartTime = "11:00",
            EndTime = "15:00",
        });

        var rules = (await _service.GetWeeklyScheduleAsync(_personnelId)).ToList();
        var mondayRule = rules.Single(rule => rule.DayOfWeek == (int)DayOfWeek.Monday);
        mondayRule.StartTime = "07:00";
        mondayRule.EndTime = "13:00";
        await _service.UpdateWeeklyScheduleAsync(_personnelId, rules);

        var day = await _service.GetDayAvailabilityAsync(_personnelId, monday);
        var window = Assert.Single(day.Windows);
        Assert.Equal("11:00", window.StartTime);
        Assert.Equal("15:00", window.EndTime);
        Assert.False(window.IsGeneratedFromWeeklySchedule);
    }

    [Fact]
    public async Task Concurrent_first_week_reads_create_one_schedule_and_both_succeed()
    {
        var databaseName = $"availability-concurrency-{Guid.NewGuid():N}";
        var connectionString = $"Data Source={databaseName};Mode=Memory;Cache=Shared";
        await using var keeper = new SqliteConnection(connectionString);
        await keeper.OpenAsync();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connectionString)
            .Options;
        var personnelId = Guid.NewGuid().ToString();
        await using (var setup = new ApplicationDbContext(options))
        {
            await setup.Database.EnsureCreatedAsync();
            setup.Users.Add(new User
            {
                Id = personnelId,
                UserName = "concurrent.schedule@example.test",
                NormalizedUserName = "CONCURRENT.SCHEDULE@EXAMPLE.TEST",
                Email = "concurrent.schedule@example.test",
                NormalizedEmail = "CONCURRENT.SCHEDULE@EXAMPLE.TEST",
                FullName = "Concurrent Schedule Nurse",
                Role = UserRoles.Nurse,
            });
            await setup.SaveChangesAsync();
        }

        await using var firstContext = new ApplicationDbContext(options);
        await using var secondContext = new ApplicationDbContext(options);
        var firstService = CreateService(firstContext);
        var secondService = CreateService(secondContext);
        var monday = Next(DayOfWeek.Monday);

        var weeks = await Task.WhenAll(
            firstService.GetWeekAvailabilityAsync(personnelId, monday),
            secondService.GetWeekAvailabilityAsync(personnelId, monday));

        Assert.All(weeks, week => Assert.Equal(7, week.Days.Count));
        await using var verification = new ApplicationDbContext(options);
        Assert.Equal(7, await verification.WeeklyAvailabilityRules.CountAsync(rule =>
            rule.PersonnelId == personnelId));
        Assert.Equal(7, await verification.AvailabilityWindows.CountAsync(window =>
            window.PersonnelId == personnelId &&
            window.Date >= monday && window.Date <= monday.AddDays(6)));
    }

    private static DateTime Next(DayOfWeek dayOfWeek)
    {
        var date = DateTime.Today.AddDays(1);
        while (date.DayOfWeek != dayOfWeek) date = date.AddDays(1);
        return date.Date;
    }

    private static AvailabilityService CreateService(ApplicationDbContext context) => new(
        new AvailabilityRepository(context),
        new AvailabilityWindowRepository(context),
        new AppointmentRepository(context),
        context);

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }
}
