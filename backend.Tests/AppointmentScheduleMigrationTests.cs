using backend.DAL;
using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

public sealed class AppointmentScheduleMigrationTests
{
    [Fact]
    public async Task Migration_adds_duration_and_overlap_guards()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var context = new ApplicationDbContext(options);
        await context.Database.MigrateAsync();

        var appointmentColumns = await context.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('Appointments')")
            .ToListAsync();
        var triggers = await context.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger'")
            .ToListAsync();

        Assert.Contains("AdditionalDurationMinutes", appointmentColumns);
        Assert.Contains("TR_Appointments_PreventOverlappingNurseVisits_Insert", triggers);
        Assert.Contains("TR_Appointments_PreventOverlappingNurseVisits_Update", triggers);
        Assert.Contains("TR_Appointments_PreventOverlappingPatientVisits_Insert", triggers);
        Assert.Contains("TR_Appointments_PreventOverlappingPatientVisits_Update", triggers);

        var nurse = AddUser(context, "migration.nurse@example.test", "Nurse");
        var anotherNurse = AddUser(context, "migration.nurse2@example.test", "Nurse");
        var patient = AddUser(context, "migration.patient@example.test", "Patient");
        var otherPatient = AddUser(context, "migration.patient2@example.test", "Patient");
        var date = DateTime.Today.AddDays(3);
        var firstNurseSlot = AddAvailability(context, nurse.Id, date, 9);
        var overlappingNurseSlot = AddAvailability(context, nurse.Id, date, 9.25);
        var overlappingPatientSlot = AddAvailability(context, anotherNurse.Id, date, 9.25);
        context.Appointments.Add(new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = firstNurseSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 30),
            Status = "Booked",
        });
        await context.SaveChangesAsync();

        context.Appointments.Add(new Appointment
        {
            PatientId = otherPatient.Id,
            AvailabilityId = overlappingNurseSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromMinutes(9 * 60 + 15),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 45),
            Status = "Booked",
        });
        var nurseOverlap = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        Assert.Contains("Nurse appointments cannot overlap", nurseOverlap.InnerException?.Message);

        context.ChangeTracker.Clear();
        context.Appointments.Add(new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = overlappingPatientSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromMinutes(9 * 60 + 15),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 45),
            Status = "Booked",
        });
        var patientOverlap = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        Assert.Contains("Patient appointments cannot overlap", patientOverlap.InnerException?.Message);
    }

    private static User AddUser(ApplicationDbContext context, string email, string role)
    {
        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            UserName = email,
            NormalizedUserName = email.ToUpperInvariant(),
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            FullName = email,
            Role = role,
        };
        context.Users.Add(user);
        context.SaveChanges();
        return user;
    }

    private static Availability AddAvailability(
        ApplicationDbContext context,
        string personnelId,
        DateTime date,
        double startHour)
    {
        var start = TimeSpan.FromHours(startHour);
        var availability = new Availability
        {
            PersonnelId = personnelId,
            Date = date,
            StartTime = start,
            EndTime = start.Add(TimeSpan.FromMinutes(15)),
        };
        context.Availabilities.Add(availability);
        context.SaveChanges();
        return availability;
    }
}
