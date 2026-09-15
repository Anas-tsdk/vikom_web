using backend.DAL;
using backend.DAL.Repositories;
using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

public class AppointmentPlanningCountTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ApplicationDbContext _context;

    public AppointmentPlanningCountTests()
    {
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(_connection).Options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task Planned_count_and_upcoming_list_exclude_completed_and_elapsed_appointments()
    {
        var personnel = new User { Id = "personnel", UserName = "nurse", FullName = "Nurse", Role = "Personnel" };
        var patient = new User { Id = "patient", UserName = "patient", FullName = "Patient", Role = "Patient" };
        _context.Users.AddRange(personnel, patient);

        AddAppointment(patient, personnel, DateTime.Today.AddDays(-1), "Booked");
        AddAppointment(patient, personnel, DateTime.Today.AddDays(2), "Completed");
        var future = AddAppointment(patient, personnel, DateTime.Today.AddDays(3), "Booked");
        await _context.SaveChangesAsync();

        var repository = new AppointmentRepository(_context);

        Assert.Equal(1, await repository.GetPendingCountAsync(personnel.Id));
        var upcoming = (await repository.GetUpcomingByPersonnelIdAsync(personnel.Id, 10)).ToList();
        Assert.Single(upcoming);
        Assert.Equal(future.Id, upcoming[0].Id);
    }

    private Appointment AddAppointment(User patient, User personnel, DateTime date, string status)
    {
        var availability = new Availability
        {
            Personnel = personnel,
            PersonnelId = personnel.Id,
            Date = date.Date,
            StartTime = TimeSpan.FromHours(10),
            EndTime = TimeSpan.FromHours(11)
        };
        var appointment = new Appointment
        {
            Patient = patient,
            PatientId = patient.Id,
            Availability = availability,
            Tasks = "Care",
            StartTime = availability.StartTime,
            EndTime = availability.EndTime,
            Status = status
        };
        _context.Appointments.Add(appointment);
        return appointment;
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }
}
