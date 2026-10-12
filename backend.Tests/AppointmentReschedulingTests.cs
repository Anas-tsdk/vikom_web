using backend.DAL;
using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

public sealed class AppointmentReschedulingTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;

    public AppointmentReschedulingTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(_connection).Options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task Planned_appointment_can_move_to_an_available_future_slot()
    {
        var personnel = AddUser("reschedule.nurse@example.test", "Personnel");
        var patient = AddUser("reschedule.patient@example.test", "Patient");
        var firstSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 9);
        var nextSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(4), 13);
        var appointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = firstSlot.Id,
            Tasks = "Medisin",
            StartTime = firstSlot.StartTime,
            EndTime = firstSlot.EndTime,
            Status = "Booked",
            PatientResponseStatus = "Accepted",
        };
        _context.Appointments.Add(appointment);
        await _context.SaveChangesAsync();

        var service = new AppointmentService(
            new AppointmentRepository(_context),
            new AvailabilityRepository(_context),
            CreateAvailabilityService(),
            new UserRepository(_context),
            new NoopHttpClientFactory(),
            new ConfigurationBuilder().Build(),
            NullLogger<AppointmentService>.Instance);

        var result = await service.UpdateAsync(appointment.Id, new AppointmentDto
        {
            Id = appointment.Id,
            PatientId = patient.Id,
            AvailabilityId = nextSlot.Id,
            Tasks = appointment.Tasks,
            Status = appointment.Status,
        });

        Assert.Equal(nextSlot.Id, result.AvailabilityId);
        Assert.Equal(nextSlot.Date.ToString("yyyy-MM-dd"), result.Date);
        Assert.Equal("13:00", result.StartTime);
        Assert.Equal("Pending", result.PatientResponseStatus);
        Assert.Null(result.PatientRespondedAt);
    }

    [Fact]
    public async Task New_appointment_end_time_uses_task_durations_and_additional_minutes()
    {
        var personnel = AddUser("duration.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("duration.patient@example.test", UserRoles.Patient);
        var slot = AddWindowedAvailability(personnel.Id, DateTime.Today.AddDays(3), 9);

        var result = await CreateService().CreateAsync(new AppointmentDto
        {
            PatientId = patient.Id,
            AvailabilityId = slot.Id,
            Tasks = "Medisin, Bading, Servering av måltider, Husholdning, Digital hjelp, Annet",
            AdditionalDurationMinutes = 10,
        });

        Assert.Equal("09:00", result.StartTime);
        Assert.Equal("10:30", result.EndTime);
        Assert.Equal(10, result.AdditionalDurationMinutes);
    }

    [Fact]
    public async Task New_appointment_is_rejected_when_its_duration_overlaps_another_nurse_visit()
    {
        var personnel = AddUser("overlap.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("overlap.patient@example.test", UserRoles.Patient);
        var otherPatient = AddUser("overlap.other.patient@example.test", UserRoles.Patient);
        var date = DateTime.Today.AddDays(3);
        var newSlot = AddWindowedAvailability(personnel.Id, date, 9);
        var existingSlot = AddWindowedAvailability(personnel.Id, date, 9.25);
        _context.Appointments.Add(new Appointment
        {
            PatientId = otherPatient.Id,
            AvailabilityId = existingSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromMinutes(9 * 60 + 6),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 21),
            Status = "Booked",
        });
        await _context.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService().CreateAsync(new AppointmentDto
            {
                PatientId = patient.Id,
                AvailabilityId = newSlot.Id,
                Tasks = "Medisin",
            }));

        Assert.Contains("overlap", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task New_appointment_requires_a_traffic_adjusted_travel_gap()
    {
        var personnel = AddUser("travel.nurse@example.test", UserRoles.Nurse);
        var previousPatient = AddUser("travel.previous.patient@example.test", UserRoles.Patient);
        var patient = AddUser("travel.patient@example.test", UserRoles.Patient);
        previousPatient.Latitude = 59.91;
        previousPatient.Longitude = 10.75;
        patient.Latitude = 59.955;
        patient.Longitude = 10.75;
        var date = DateTime.Today.AddDays(3);
        var previousSlot = AddWindowedAvailability(personnel.Id, date, 9);
        var candidateSlot = AddWindowedAvailability(personnel.Id, date, 9.5);
        _context.Appointments.Add(new Appointment
        {
            PatientId = previousPatient.Id,
            AvailabilityId = previousSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 15),
            Status = "Booked",
        });
        await _context.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService().CreateAsync(new AppointmentDto
            {
                PatientId = patient.Id,
                AvailabilityId = candidateSlot.Id,
                Tasks = "Medisin",
            }));

        Assert.Contains("travel-time", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Patient_cannot_be_booked_for_overlapping_visits_with_different_nurses()
    {
        var selectedNurse = AddUser("patient-overlap.nurse@example.test", UserRoles.Nurse);
        var assignedNurse = AddUser("patient-overlap.assigned@example.test", UserRoles.Nurse);
        var patient = AddUser("patient-overlap.patient@example.test", UserRoles.Patient);
        var date = DateTime.Today.AddDays(3);
        var newSlot = AddWindowedAvailability(selectedNurse.Id, date, 9);
        var existingSlot = AddWindowedAvailability(assignedNurse.Id, date, 9);
        _context.Appointments.Add(new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = existingSlot.Id,
            Tasks = "Medisin",
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromMinutes(9 * 60 + 30),
            Status = "Booked",
        });
        await _context.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService().CreateAsync(new AppointmentDto
            {
                PatientId = patient.Id,
                AvailabilityId = newSlot.Id,
                Tasks = "Medisin",
            }));

        Assert.Contains("overlap", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Patient_can_accept_their_pending_appointment_invitation()
    {
        var personnel = AddUser("accept.nurse@example.test", "Personnel");
        var patient = AddUser("accept.patient@example.test", "Patient");
        var slot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var appointment = AddPendingAppointment(patient.Id, slot);

        var result = await CreateService().RespondToInvitationAsync(
            appointment.Id,
            patient.Id,
            "Accepted");

        Assert.NotNull(result);
        Assert.Equal("Accepted", result.PatientResponseStatus);
        Assert.Equal("Booked", result.Status);
        Assert.NotNull(result.PatientRespondedAt);
    }

    [Fact]
    public async Task Declining_an_invitation_cancels_the_appointment_and_frees_it_from_planning()
    {
        var personnel = AddUser("decline.nurse@example.test", "Personnel");
        var patient = AddUser("decline.patient@example.test", "Patient");
        var slot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var appointment = AddPendingAppointment(patient.Id, slot);

        var result = await CreateService().RespondToInvitationAsync(
            appointment.Id,
            patient.Id,
            "Declined");

        Assert.NotNull(result);
        Assert.Equal("Declined", result.PatientResponseStatus);
        Assert.Equal("Cancelled", result.Status);
        Assert.Equal(0, await new AppointmentRepository(_context).GetPendingCountAsync(personnel.Id));
    }

    [Fact]
    public async Task Patient_can_propose_an_alternative_and_head_nurse_can_replan_it()
    {
        var personnel = AddUser("proposal.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("proposal.patient@example.test", UserRoles.Patient);
        var firstSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var replayOfDeclinedSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var nextSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(5), 14);
        var appointment = AddPendingAppointment(patient.Id, firstSlot);
        var service = CreateService();

        var declined = await service.RespondToInvitationAsync(
            appointment.Id,
            patient.Id,
            "Declined",
            DateTime.Today.AddDays(5).ToString("yyyy-MM-dd"),
            "14:00",
            "15:00");

        Assert.NotNull(declined);
        Assert.Equal("Cancelled", declined.Status);
        Assert.Equal(DateTime.Today.AddDays(5).ToString("yyyy-MM-dd"), declined.PatientProposedDate);
        Assert.Equal("14:00", declined.PatientProposedStartTime);
        Assert.Equal("15:00", declined.PatientProposedEndTime);

        var replanned = await service.UpdateAsync(appointment.Id, new AppointmentDto
        {
            Id = appointment.Id,
            PatientId = patient.Id,
            AvailabilityId = nextSlot.Id,
            Tasks = appointment.Tasks,
            // This is the stale status an edit form loaded from the declined row.
            Status = "Cancelled"
        });

        Assert.Equal("Booked", replanned.Status);
        Assert.Equal("Pending", replanned.PatientResponseStatus);
        Assert.Equal(nextSlot.Id, replanned.AvailabilityId);
        Assert.Null(replanned.PatientProposedDate);
        Assert.Null(replanned.PatientProposedStartTime);
        Assert.Null(replanned.PatientProposedEndTime);

        Assert.Single(_context.DeclinedAppointmentSlots);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new AppointmentDto
            {
                PatientId = patient.Id,
                AvailabilityId = replayOfDeclinedSlot.Id,
                Tasks = "Medisin",
                Status = "Booked"
            }));
        Assert.Equal(
            "Cannot schedule a patient in a time range they have already declined",
            error.Message);
    }

    [Fact]
    public async Task Head_nurse_can_accept_a_proposal_into_a_free_nurse_slot()
    {
        var personnel = AddUser("accept-proposal.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("accept-proposal.patient@example.test", UserRoles.Patient);
        var date = NextWeekday(DateTime.Today);
        var declinedSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var appointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = declinedSlot.Id,
            Tasks = "Medisin",
            StartTime = declinedSlot.StartTime,
            EndTime = declinedSlot.EndTime,
            Status = "Cancelled",
            PatientResponseStatus = "Declined",
            PatientProposedDate = date,
            PatientProposedStartTime = TimeSpan.FromHours(13.5),
            PatientProposedEndTime = TimeSpan.FromHours(14.5),
        };
        _context.Appointments.Add(appointment);
        await _context.SaveChangesAsync();

        var result = await CreateService().AcceptPatientProposalAsync(appointment.Id);

        var matchingSlot = await new AvailabilityRepository(_context).GetByIdAsync(result.AvailabilityId);
        Assert.NotNull(matchingSlot);
        Assert.Equal(personnel.Id, matchingSlot.PersonnelId);
        Assert.Equal(date.ToString("yyyy-MM-dd"), result.Date);
        Assert.Equal("13:30", result.StartTime);
        Assert.Equal("13:45", result.EndTime);
        Assert.Equal("Booked", result.Status);
        Assert.Equal("Accepted", result.PatientResponseStatus);
        Assert.Null(result.PatientProposedDate);
        Assert.Null(result.PatientProposedStartTime);
        Assert.Null(result.PatientProposedEndTime);
    }

    [Fact]
    public async Task Accepting_a_proposal_fails_when_the_matching_slot_overlaps_a_booked_visit()
    {
        var personnel = AddUser("no-fit.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("no-fit.patient@example.test", UserRoles.Patient);
        var date = DateTime.Today.AddDays(5);
        var declinedSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        AddAvailability(personnel.Id, date, 14);
        var overlappingSlot = AddAvailability(personnel.Id, date, 14);
        overlappingSlot.StartTime = TimeSpan.FromHours(14.5);
        overlappingSlot.EndTime = TimeSpan.FromHours(15.5);
        var otherAppointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = overlappingSlot.Id,
            Tasks = "Medisin",
            StartTime = overlappingSlot.StartTime,
            EndTime = overlappingSlot.EndTime,
            Status = "Booked",
            PatientResponseStatus = "Accepted",
        };
        _context.Appointments.Add(otherAppointment);
        var appointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = declinedSlot.Id,
            Tasks = "Medisin",
            StartTime = declinedSlot.StartTime,
            EndTime = declinedSlot.EndTime,
            Status = "Cancelled",
            PatientResponseStatus = "Declined",
            PatientProposedDate = date,
            PatientProposedStartTime = TimeSpan.FromHours(14),
            PatientProposedEndTime = TimeSpan.FromHours(15),
        };
        _context.Appointments.Add(appointment);
        await _context.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService().AcceptPatientProposalAsync(appointment.Id));

        Assert.Equal("No available nurse slot fits the proposed time", error.Message);
        Assert.Equal("Cancelled", appointment.Status);
        Assert.Equal("Declined", appointment.PatientResponseStatus);
        Assert.Equal(date, appointment.PatientProposedDate);
    }

    [Fact]
    public async Task Head_nurse_can_replan_a_decline_without_a_patient_proposal()
    {
        var personnel = AddUser("decline-only.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("decline-only.patient@example.test", UserRoles.Patient);
        var firstSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var nextSlot = AddAvailability(personnel.Id, DateTime.Today.AddDays(4), 12);
        var appointment = AddPendingAppointment(patient.Id, firstSlot);
        var service = CreateService();

        await service.RespondToInvitationAsync(appointment.Id, patient.Id, "Declined");

        var replanned = await service.UpdateAsync(appointment.Id, new AppointmentDto
        {
            Id = appointment.Id,
            PatientId = patient.Id,
            AvailabilityId = nextSlot.Id,
            Tasks = appointment.Tasks,
            Status = "Cancelled"
        });

        Assert.Equal("Booked", replanned.Status);
        Assert.Equal("Pending", replanned.PatientResponseStatus);
        Assert.Equal(nextSlot.Id, replanned.AvailabilityId);
    }

    [Fact]
    public async Task Patient_cannot_be_replanned_into_an_overlapping_declined_time()
    {
        var personnel = AddUser("blocked-slot.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("blocked-slot.patient@example.test", UserRoles.Patient);
        var date = DateTime.Today.AddDays(3);
        var declinedSlot = AddAvailability(personnel.Id, date, 10);
        var overlappingSlot = AddAvailability(personnel.Id, date, 10);
        overlappingSlot.StartTime = TimeSpan.FromHours(10.5);
        overlappingSlot.EndTime = TimeSpan.FromHours(11.5);
        _context.SaveChanges();
        var appointment = AddPendingAppointment(patient.Id, declinedSlot);
        var service = CreateService();

        await service.RespondToInvitationAsync(appointment.Id, patient.Id, "Declined");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.UpdateAsync(appointment.Id, new AppointmentDto
            {
                Id = appointment.Id,
                PatientId = patient.Id,
                AvailabilityId = overlappingSlot.Id,
                Tasks = appointment.Tasks,
                Status = "Cancelled"
            }));

        Assert.Equal(
            "Cannot schedule a patient in a time range they have already declined",
            error.Message);
    }

    [Fact]
    public async Task Incomplete_or_invalid_alternative_is_rejected()
    {
        var personnel = AddUser("invalid-proposal.nurse@example.test", UserRoles.Nurse);
        var patient = AddUser("invalid-proposal.patient@example.test", UserRoles.Patient);
        var slot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var appointment = AddPendingAppointment(patient.Id, slot);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService().RespondToInvitationAsync(
                appointment.Id,
                patient.Id,
                "Declined",
                DateTime.Today.AddDays(5).ToString("yyyy-MM-dd"),
                "14:00",
                null));

        Assert.Equal("Pending", appointment.PatientResponseStatus);
        Assert.Equal("Booked", appointment.Status);
    }

    [Fact]
    public async Task Patient_cannot_answer_another_patients_invitation()
    {
        var personnel = AddUser("owner.nurse@example.test", "Personnel");
        var patient = AddUser("owner.patient@example.test", "Patient");
        var otherPatient = AddUser("other.patient@example.test", "Patient");
        var slot = AddAvailability(personnel.Id, DateTime.Today.AddDays(3), 10);
        var appointment = AddPendingAppointment(patient.Id, slot);

        var result = await CreateService().RespondToInvitationAsync(
            appointment.Id,
            otherPatient.Id,
            "Accepted");

        Assert.Null(result);
        Assert.Equal("Pending", appointment.PatientResponseStatus);
    }

    private Appointment AddPendingAppointment(string patientId, Availability slot)
    {
        var appointment = new Appointment
        {
            PatientId = patientId,
            AvailabilityId = slot.Id,
            Tasks = "Medisin",
            StartTime = slot.StartTime,
            EndTime = slot.EndTime,
            Status = "Booked",
            PatientResponseStatus = "Pending"
        };
        _context.Appointments.Add(appointment);
        _context.SaveChanges();
        return appointment;
    }

    private AppointmentService CreateService() => new(
        new AppointmentRepository(_context),
        new AvailabilityRepository(_context),
        CreateAvailabilityService(),
        new UserRepository(_context),
        new NoopHttpClientFactory(),
        new ConfigurationBuilder().Build(),
        NullLogger<AppointmentService>.Instance);

    private AvailabilityService CreateAvailabilityService() => new(
        new AvailabilityRepository(_context),
        new AvailabilityWindowRepository(_context),
        new AppointmentRepository(_context),
        _context);

    private static DateTime NextWeekday(DateTime date)
    {
        var next = date.Date.AddDays(1);
        while (next.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            next = next.AddDays(1);
        return next;
    }

    private User AddUser(string email, string role)
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
        _context.Users.Add(user);
        _context.SaveChanges();
        return user;
    }

    private Availability AddAvailability(string personnelId, DateTime date, int hour)
    {
        var availability = new Availability
        {
            PersonnelId = personnelId,
            Date = date,
            StartTime = TimeSpan.FromHours(hour),
            EndTime = TimeSpan.FromHours(hour + 1),
        };
        _context.Availabilities.Add(availability);
        _context.SaveChanges();
        return availability;
    }

    private Availability AddWindowedAvailability(string personnelId, DateTime date, double startHour)
    {
        var start = TimeSpan.FromHours(startHour);
        var window = new AvailabilityWindow
        {
            PersonnelId = personnelId,
            Date = date.Date,
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(17),
            IsAvailable = true,
        };
        var availability = new Availability
        {
            PersonnelId = personnelId,
            Date = date.Date,
            StartTime = start,
            EndTime = start.Add(TimeSpan.FromMinutes(15)),
            AvailabilityWindow = window,
        };
        window.Slots.Add(availability);
        _context.AvailabilityWindows.Add(window);
        _context.SaveChanges();
        return availability;
    }

    private sealed class NoopHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }
}
