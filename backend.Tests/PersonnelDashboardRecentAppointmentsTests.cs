using backend.DAL;
using backend.DAL.Repositories;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

public sealed class PersonnelDashboardRecentAppointmentsTests : IDisposable
{
    private static readonly DateTimeOffset FixedNow =
        new(2030, 6, 18, 12, 0, 0, TimeSpan.Zero);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ApplicationDbContext _context;
    private readonly User _personnel = new()
    {
        Id = "recent-nurse",
        UserName = "recent.nurse@example.test",
        FullName = "Recent Nurse",
        Role = "Personnel"
    };
    private readonly User _patient = new()
    {
        Id = "recent-patient",
        UserName = "recent.patient@example.test",
        FullName = "Recent Patient",
        Role = "Patient"
    };

    public PersonnelDashboardRecentAppointmentsTests()
    {
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlite(_connection)
                .Options);
        _context.Database.EnsureCreated();
        _context.Users.AddRange(_personnel, _patient);
    }

    [Fact]
    public async Task Recent_list_contains_only_concluded_appointments_and_includes_today()
    {
        var today = FixedNow.Date;
        var completedToday = AddAppointment(today, 9, 10, "Completed");
        var incompleteYesterday = AddAppointment(today.AddDays(-1), 15, 16, "NotCompleted");

        AddAppointment(today, 13, 14, "Completed"); // terminal, but its scheduled end is still ahead
        AddAppointment(today.AddDays(-1), 11, 12, "Booked");
        AddAppointment(today.AddDays(-1), 10, 11, "InProgress");
        AddAppointment(today.AddDays(-1), 9, 10, "Cancelled");
        AddAppointment(today.AddDays(1), 9, 10, "Completed");

        var otherPersonnel = new User
        {
            Id = "other-nurse",
            UserName = "other.nurse@example.test",
            FullName = "Other Nurse",
            Role = "Personnel"
        };
        _context.Users.Add(otherPersonnel);
        AddAppointment(today.AddDays(-1), 17, 18, "Completed", otherPersonnel);

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        var repository = CreateAppointmentRepository();
        var recent = (await repository.GetRecentByPersonnelIdAsync(_personnel.Id, 10)).ToList();

        Assert.Equal(new[] { completedToday.Id, incompleteYesterday.Id }, recent.Select(a => a.Id));
        Assert.Empty(await repository.GetRecentByPersonnelIdAsync(_personnel.Id, 0));
    }

    [Fact]
    public async Task Dashboard_maps_visit_metadata_needed_to_open_recent_visit_details()
    {
        var appointment = AddAppointment(FixedNow.Date.AddDays(-1), 9, 10, "Completed");
        var visit = new Visit
        {
            Appointment = appointment,
            Patient = _patient,
            PatientId = _patient.Id,
            ResponsibleUser = _personnel,
            ResponsibleUserId = _personnel.Id,
            VisitType = "Physical",
            Status = "Completed",
            StartedAt = FixedNow.Date.AddDays(-1).AddHours(9),
            EndedAt = FixedNow.Date.AddDays(-1).AddHours(10),
            CompletedAt = FixedNow.Date.AddDays(-1).AddHours(10)
        };
        _context.Visits.Add(visit);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        var dashboardService = new DashboardService(
            new UserRepository(_context),
            CreateAppointmentRepository(),
            new AvailabilityRepository(_context),
            new PatientUserLinkRepository(_context));

        var dashboard = await dashboardService.GetPersonnelDashboardAsync(_personnel.Id);
        var recent = Assert.Single(dashboard.RecentAppointments);

        Assert.Equal(appointment.Id, recent.Id);
        Assert.Equal(visit.Id, recent.VisitId);
        Assert.Equal("Completed", recent.VisitStatus);
        Assert.Equal("Physical", recent.VisitType);
    }

    [Fact]
    public async Task Dashboard_patient_count_unions_links_and_appointment_assignments()
    {
        var linkedPatient = new User
        {
            Id = "linked-patient",
            UserName = "linked.patient@example.test",
            FullName = "Linked Patient",
            Role = "Patient"
        };
        _context.Users.Add(linkedPatient);
        _context.PatientUserLinks.Add(new PatientUserLink
        {
            Patient = linkedPatient,
            SecondaryUser = _personnel,
            RelationshipType = "Personnel"
        });
        AddAppointment(FixedNow.Date.AddDays(1), 9, 10, "Booked");
        await _context.SaveChangesAsync();

        var dashboardService = new DashboardService(
            new UserRepository(_context),
            CreateAppointmentRepository(),
            new AvailabilityRepository(_context),
            new PatientUserLinkRepository(_context));

        var dashboard = await dashboardService.GetPersonnelDashboardAsync(_personnel.Id);

        Assert.Equal(2, dashboard.TotalPatients);
    }

    private AppointmentRepository CreateAppointmentRepository() =>
        new(_context, new FixedTimeProvider(FixedNow));

    private Appointment AddAppointment(
        DateTime date,
        int startHour,
        int endHour,
        string status,
        User? personnel = null)
    {
        personnel ??= _personnel;
        var availability = new Availability
        {
            Personnel = personnel,
            PersonnelId = personnel.Id,
            Date = date.Date,
            StartTime = TimeSpan.FromHours(startHour),
            EndTime = TimeSpan.FromHours(endHour)
        };
        var appointment = new Appointment
        {
            Patient = _patient,
            PatientId = _patient.Id,
            Availability = availability,
            Tasks = "Care",
            StartTime = availability.StartTime,
            EndTime = availability.EndTime,
            Status = status,
            PatientResponseStatus = "Accepted"
        };
        _context.Appointments.Add(appointment);
        return appointment;
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _utcNow;

        public FixedTimeProvider(DateTimeOffset utcNow)
        {
            _utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    }
}
