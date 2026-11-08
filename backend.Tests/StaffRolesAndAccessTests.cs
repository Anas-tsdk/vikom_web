using System.Security.Claims;
using System.Text.Json;
using backend.Controllers;
using backend.DAL;
using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace backend.Tests;

public sealed class StaffRolesAndAccessTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;
    private readonly UserManager<User> _userManager;
    private readonly PortalAccessService _access;

    public StaffRolesAndAccessTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlite(_connection)
                .Options);
        _context.Database.EnsureCreated();

        foreach (var role in new[]
                 {
                     UserRoles.Nurse,
                     UserRoles.HeadNurse,
                     UserRoles.LegacyPersonnel,
                     UserRoles.Patient
                 })
        {
            _context.Roles.Add(new IdentityRole(role)
            {
                NormalizedName = role.ToUpperInvariant()
            });
        }
        _context.SaveChanges();

        _userManager = BuildUserManager(_context);
        _access = new PortalAccessService(_context);
    }

    [Fact]
    public async Task Public_registration_always_creates_a_normal_nurse()
    {
        var controller = new AuthController(
            _userManager,
            null!,
            new ConfigurationBuilder().Build(),
            NullLogger<AuthController>.Instance);

        var result = await controller.Register(new RegisterDto
        {
            UserName = "new.nurse@example.test",
            Email = "new.nurse@example.test",
            Password = "Pass123!",
            FullName = "New Nurse"
        });

        Assert.IsType<OkObjectResult>(result);
        var saved = await _userManager.FindByNameAsync("new.nurse@example.test");
        Assert.NotNull(saved);
        Assert.Equal(UserRoles.Nurse, saved.Role);
        Assert.True(await _userManager.IsInRoleAsync(saved, UserRoles.Nurse));
        Assert.False(await _userManager.IsInRoleAsync(saved, UserRoles.HeadNurse));
    }

    [Fact]
    public async Task Session_refresh_replaces_legacy_browser_role_with_current_head_nurse_role()
    {
        var nora = await AddUserAsync("nurse@homecare.local", UserRoles.HeadNurse);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "TestOnlySecretKeyForJwtGeneration123456",
                ["Jwt:Issuer"] = "test-issuer",
                ["Jwt:Audience"] = "test-audience"
            })
            .Build();
        var controller = new AuthController(
            _userManager,
            null!,
            configuration,
            NullLogger<AuthController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    // Simulates Nora returning with a token issued before the
                    // Personnel -> HeadNurse migration.
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        new[]
                        {
                            new Claim(ClaimTypes.NameIdentifier, nora.Id),
                            new Claim(ClaimTypes.Role, UserRoles.LegacyPersonnel)
                        },
                        "test"))
                }
            }
        };

        var result = await controller.RefreshSession();

        var ok = Assert.IsType<OkObjectResult>(result);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(ok.Value));
        Assert.Equal(UserRoles.HeadNurse, json.RootElement.GetProperty("role").GetString());
        Assert.False(string.IsNullOrWhiteSpace(
            json.RootElement.GetProperty("token").GetString()));
    }

    [Fact]
    public async Task Head_nurse_can_provision_both_roles_but_a_nurse_cannot()
    {
        var head = await AddUserAsync("head@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("nurse@example.test", UserRoles.Nurse);
        var request = new PersonnelRegistrationDto
        {
            UserName = "second.head@example.test",
            Email = "second.head@example.test",
            Password = "Pass123!",
            FullName = "Second Head",
            Role = UserRoles.HeadNurse
        };

        var headController = PersonnelControllerFor(head);
        var created = await headController.CreatePersonnel(request);
        var createdResult = Assert.IsType<CreatedAtActionResult>(created.Result);
        var dto = Assert.IsType<UserDto>(createdResult.Value);
        Assert.Equal(UserRoles.HeadNurse, dto.Role);

        var nurseController = PersonnelControllerFor(nurse);
        var forbidden = await nurseController.CreatePersonnel(new PersonnelRegistrationDto
        {
            UserName = "forbidden@example.test",
            Email = "forbidden@example.test",
            Password = "Pass123!",
            FullName = "Forbidden Head",
            Role = UserRoles.HeadNurse
        });
        Assert.IsType<ForbidResult>(forbidden.Result);
        Assert.Null(await _userManager.FindByNameAsync("forbidden@example.test"));
    }

    [Fact]
    public async Task Directory_is_all_staff_for_head_nurse_and_self_only_for_nurse()
    {
        var head = await AddUserAsync("head.directory@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("nurse.directory@example.test", UserRoles.Nurse);
        await AddUserAsync("legacy.directory@example.test", UserRoles.LegacyPersonnel);
        var patient = await AddUserAsync("patient.directory@example.test", UserRoles.Patient);

        var headResult = await PersonnelControllerFor(head).GetPersonnel();
        var headDtos = Assert.IsAssignableFrom<IEnumerable<UserDto>>(
            Assert.IsType<OkObjectResult>(headResult.Result).Value).ToList();
        Assert.Equal(3, headDtos.Count);

        var nurseResult = await PersonnelControllerFor(nurse).GetPersonnel();
        var nurseDto = Assert.Single(Assert.IsAssignableFrom<IEnumerable<UserDto>>(
            Assert.IsType<OkObjectResult>(nurseResult.Result).Value));
        Assert.Equal(nurse.Id, nurseDto.Id);

        var scheduleOptions = Assert.IsAssignableFrom<IEnumerable<PersonnelScheduleOptionDto>>(
            Assert.IsType<OkObjectResult>(
                (await PersonnelControllerFor(nurse).GetScheduleOptions()).Result).Value).ToList();
        Assert.Equal(3, scheduleOptions.Count);
        Assert.Contains(scheduleOptions, option => option.Id == head.Id);
        Assert.DoesNotContain(scheduleOptions, option => option.Id == patient.Id);

        var callOptions = Assert.IsAssignableFrom<IEnumerable<PersonnelCallOptionDto>>(
            Assert.IsType<OkObjectResult>(
                (await PersonnelControllerFor(nurse).GetCallOptions()).Result).Value).ToList();
        Assert.Equal(3, callOptions.Count);
        Assert.Contains(callOptions, option =>
            option.Id == head.Id && option.Role == UserRoles.HeadNurse);
        Assert.DoesNotContain(callOptions, option => option.Id == patient.Id);
    }

    [Fact]
    public async Task Nurse_access_is_scoped_while_head_nurse_can_manage_every_schedule_and_patient()
    {
        var head = await AddUserAsync("head.access@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("nurse.access@example.test", UserRoles.Nurse);
        var otherNurse = await AddUserAsync("other.access@example.test", UserRoles.Nurse);
        var linkedPatient = await AddUserAsync("linked.patient@example.test", UserRoles.Patient);
        linkedPatient.ProfileUsername = "linked.patient";
        await _userManager.UpdateAsync(linkedPatient);
        var unlinkedPatient = await AddUserAsync("unlinked.patient@example.test", UserRoles.Patient);
        _context.PatientUserLinks.Add(new PatientUserLink
        {
            PatientId = linkedPatient.Id,
            SecondaryUserId = nurse.Id,
            RelationshipType = "Personnel"
        });
        await _context.SaveChangesAsync();

        var nursePrincipal = PrincipalFor(nurse);
        Assert.True(await _access.CanManagePersonnelAsync(nursePrincipal, nurse.Id));
        Assert.False(await _access.CanManagePersonnelAsync(nursePrincipal, otherNurse.Id));
        Assert.True(await _access.CanViewPersonnelAsync(nursePrincipal, otherNurse.Id));
        Assert.True(await _access.CanAccessPatientAsync(nursePrincipal, linkedPatient.Id));
        Assert.True(await _access.CanAccessPatientAsync(nursePrincipal, "linked.patient"));
        Assert.False(await _access.CanAccessPatientAsync(nursePrincipal, unlinkedPatient.Id));

        var headPrincipal = PrincipalFor(head);
        Assert.True(await _access.CanManagePersonnelAsync(headPrincipal, otherNurse.Id));
        Assert.False(await _access.CanManagePersonnelAsync(headPrincipal, unlinkedPatient.Id));
        Assert.True(await _access.CanAccessPatientAsync(headPrincipal, unlinkedPatient.Id));
    }

    [Fact]
    public async Task Availability_endpoints_reject_non_staff_targets_and_mismatched_window_owners()
    {
        var head = await AddUserAsync("availability.head@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("availability.nurse@example.test", UserRoles.Nurse);
        var otherNurse = await AddUserAsync("availability.other@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("availability.patient@example.test", UserRoles.Patient);
        var controller = AvailabilityControllerFor(head);

        Assert.IsType<BadRequestObjectResult>((await controller.GetWeekAvailability(
            patient.Id, DateTime.Today.ToString("yyyy-MM-dd"))).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.GetDayAvailability(
            patient.Id, DateTime.Today.ToString("yyyy-MM-dd"))).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.GetWeeklySchedule(patient.Id)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.UpdateWeeklySchedule(
            new List<WeeklyAvailabilityRuleDto>(), patient.Id)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.CreateAvailabilityWindow(
            new CreateAvailabilityWindowDto
            {
                Date = DateTime.Today.AddDays(1).ToString("yyyy-MM-dd"),
                IsAvailable = true,
            }, patient.Id)).Result);

        var window = new AvailabilityWindow
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(1),
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(17),
            IsAvailable = true,
        };
        _context.AvailabilityWindows.Add(window);
        await _context.SaveChangesAsync();

        Assert.IsType<BadRequestObjectResult>(await controller.UpdateAvailabilityWindow(
            window.Id,
            new UpdateAvailabilityWindowDto
            {
                Date = window.Date.ToString("yyyy-MM-dd"),
                StartTime = "10:00",
                EndTime = "16:00",
                IsAvailable = true,
            },
            otherNurse.Id));
        Assert.IsType<BadRequestObjectResult>(await controller.DeleteAvailabilityWindow(
            window.Id, patient.Id));

        Assert.Empty(await _context.WeeklyAvailabilityRules.Where(rule =>
            rule.PersonnelId == patient.Id).ToListAsync());
        Assert.Empty(await _context.AvailabilityWindows.Where(item =>
            item.PersonnelId == patient.Id).ToListAsync());
        var unchanged = await _context.AvailabilityWindows.SingleAsync(item => item.Id == window.Id);
        Assert.Equal(TimeSpan.FromHours(9), unchanged.StartTime);
        Assert.Equal(TimeSpan.FromHours(17), unchanged.EndTime);
    }

    [Fact]
    public async Task Normal_nurse_cannot_create_an_appointment()
    {
        var nurse = await AddUserAsync("appointment.nurse@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("appointment.patient@example.test", UserRoles.Patient);
        var appointmentRepository = new AppointmentRepository(_context);
        var availabilityRepository = new AvailabilityRepository(_context);
        var availabilityService = new AvailabilityService(
            availabilityRepository,
            new AvailabilityWindowRepository(_context),
            appointmentRepository,
            _context);
        var appointmentService = new AppointmentService(
            appointmentRepository,
            availabilityRepository,
            availabilityService,
            new UserRepository(_context),
            new NoopHttpClientFactory(),
            new ConfigurationBuilder().Build(),
            NullLogger<AppointmentService>.Instance);
        var controller = new AppointmentsController(
            appointmentService,
            availabilityService,
            _access,
            NullLogger<AppointmentsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = PrincipalFor(nurse) }
            }
        };

        var result = await controller.CreateAppointment(new AppointmentDto
        {
            PatientId = patient.Id,
            AvailabilityId = 123,
            Tasks = "Medication"
        });

        Assert.IsType<ForbidResult>(result.Result);
        Assert.Empty(await _context.Appointments.ToListAsync());
    }

    [Fact]
    public async Task Head_nurse_can_view_but_cannot_execute_another_nurses_visit()
    {
        var head = await AddUserAsync("visit.head@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("visit.nurse@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("visit.patient@example.test", UserRoles.Patient);
        var availability = new Availability
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(1),
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(10)
        };
        _context.Availabilities.Add(availability);
        await _context.SaveChangesAsync();

        var appointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = availability.Id,
            StartTime = availability.StartTime,
            EndTime = availability.EndTime,
            Tasks = "Medication",
            Status = "Booked"
        };
        _context.Appointments.Add(appointment);
        await _context.SaveChangesAsync();

        var controller = VisitsControllerFor(head);
        var start = await controller.StartVisit(new StartVisitRequest
        {
            AppointmentId = appointment.Id,
            VisitType = "Physical"
        });
        Assert.IsType<ForbidResult>(start.Result);

        var visit = new Visit
        {
            AppointmentId = appointment.Id,
            PatientId = patient.Id,
            ResponsibleUserId = nurse.Id,
            VisitType = "Physical",
            Status = "Active",
            StartedAt = DateTime.UtcNow
        };
        _context.Visits.Add(visit);
        await _context.SaveChangesAsync();

        // Head nurses retain oversight/read access.
        var read = await controller.GetVisit(visit.Id);
        Assert.IsType<OkObjectResult>(read.Result);

        Assert.IsType<ForbidResult>((await controller.UpdateNotes(
            visit.Id, new UpdateVisitNotesRequest { Notes = "takeover" })).Result);
        Assert.IsType<ForbidResult>((await controller.AddTask(
            visit.Id, new AddVisitTaskRequest { Title = "takeover task" })).Result);
        Assert.IsType<ForbidResult>((await controller.CompleteVisit(
            visit.Id, new CompleteVisitRequest { Notes = "takeover" })).Result);
        Assert.IsType<ForbidResult>((await controller.CancelVisit(
            visit.Id, new CancelVisitRequest { Reason = "takeover" })).Result);
        Assert.IsType<ForbidResult>((await controller.LogCallAttempt(
            visit.Id, new LogCallAttemptRequest())).Result);

        _context.ChangeTracker.Clear();
        var unchanged = await _context.Visits.SingleAsync(item => item.Id == visit.Id);
        Assert.Equal("Active", unchanged.Status);
        Assert.Null(unchanged.Notes);
        Assert.Empty(await _context.VisitTasks.ToListAsync());
        Assert.Empty(await _context.CallLogs.ToListAsync());
    }

    [Fact]
    public async Task Assigned_nurse_can_start_their_own_visit()
    {
        var nurse = await AddUserAsync("own.visit.nurse@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("own.visit.patient@example.test", UserRoles.Patient);
        var availability = new Availability
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(1),
            StartTime = TimeSpan.FromHours(11),
            EndTime = TimeSpan.FromHours(12)
        };
        _context.Availabilities.Add(availability);
        await _context.SaveChangesAsync();
        var appointment = new Appointment
        {
            PatientId = patient.Id,
            AvailabilityId = availability.Id,
            StartTime = availability.StartTime,
            EndTime = availability.EndTime,
            Tasks = "Vitals",
            Status = "Booked"
        };
        _context.Appointments.Add(appointment);
        await _context.SaveChangesAsync();

        var result = await VisitsControllerFor(nurse).StartVisit(new StartVisitRequest
        {
            AppointmentId = appointment.Id,
            VisitType = "Physical"
        });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var visit = Assert.IsType<VisitDto>(ok.Value);
        Assert.Equal(nurse.Id, visit.ResponsibleUserId);
    }

    [Fact]
    public async Task Nurse_cannot_create_or_demographically_edit_patients_or_manage_links()
    {
        var nurse = await AddUserAsync("restricted.nurse@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("restricted.patient@example.test", UserRoles.Patient);
        _context.PatientUserLinks.Add(new PatientUserLink
        {
            PatientId = patient.Id,
            SecondaryUserId = nurse.Id,
            RelationshipType = "Personnel"
        });
        await _context.SaveChangesAsync();

        var patients = PatientsControllerFor(nurse);
        Assert.IsType<ForbidResult>((await patients.CreatePatient(new PatientCreateDto
        {
            FullName = "Unauthorized Patient",
            Email = "unauthorized.patient@example.test"
        })).Result);
        Assert.IsType<ForbidResult>((await patients.UpdatePatient(patient.Id, new PatientUpdateDto
        {
            FullName = "Changed",
            Email = patient.Email!
        })).Result);
        Assert.IsType<ForbidResult>((await patients.SearchSupabaseProfiles(
            "patient", 8, CancellationToken.None)).Result);

        // Assigned nurses still document care notes for their patients.
        var notes = await patients.UpdatePatientNotes(
            patient.Id, new PatientNotesUpdateDto { Notes = "Visited today" });
        Assert.IsType<NoContentResult>(notes);

        var treatmentPlan = await patients.UpdatePatientTreatmentPlan(
            patient.Id,
            new PatientTreatmentPlanUpdateDto { TreatmentPlan = "Daily hydration and exercise" });
        Assert.IsType<NoContentResult>(treatmentPlan);

        var otherNurse = await AddUserAsync("restricted.other-nurse@example.test", UserRoles.Nurse);
        var deniedTreatmentPlan = await PatientsControllerFor(otherNurse).UpdatePatientTreatmentPlan(
            patient.Id,
            new PatientTreatmentPlanUpdateDto { TreatmentPlan = "Unauthorized change" });
        Assert.IsType<ForbidResult>(deniedTreatmentPlan);

        var links = PatientUserLinksControllerFor(nurse);
        Assert.IsType<ForbidResult>((await links.GetAll()).Result);
        Assert.IsType<ForbidResult>((await links.Create(new CreatePatientUserLinkRequest
        {
            PatientId = patient.Id,
            SecondaryUserId = nurse.Id
        })).Result);

        _context.ChangeTracker.Clear();
        var savedPatient = await _context.Users.SingleAsync(user => user.Id == patient.Id);
        Assert.Equal(patient.FullName, savedPatient.FullName);
        Assert.Equal("Visited today", savedPatient.Notes);
        Assert.Equal("Daily hydration and exercise", savedPatient.TreatmentPlan);
        Assert.Single(await _context.PatientUserLinks.ToListAsync());
    }

    [Fact]
    public async Task Patient_details_are_scoped_to_the_nurse_while_head_nurse_sees_the_full_history()
    {
        var head = await AddUserAsync("patient.scope.head@example.test", UserRoles.HeadNurse);
        var nurse = await AddUserAsync("patient.scope.nurse@example.test", UserRoles.Nurse);
        var otherNurse = await AddUserAsync("patient.scope.other@example.test", UserRoles.Nurse);
        var patient = await AddUserAsync("patient.scope.patient@example.test", UserRoles.Patient);
        _context.PatientUserLinks.Add(new PatientUserLink
        {
            PatientId = patient.Id,
            SecondaryUserId = nurse.Id,
            RelationshipType = "Personnel"
        });

        var ownPastSlot = new Availability
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(-2),
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(10)
        };
        var otherPastSlot = new Availability
        {
            PersonnelId = otherNurse.Id,
            Date = DateTime.Today.AddDays(-1),
            StartTime = TimeSpan.FromHours(10),
            EndTime = TimeSpan.FromHours(11)
        };
        var ownUpcomingSlot = new Availability
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(1),
            StartTime = TimeSpan.FromHours(11),
            EndTime = TimeSpan.FromHours(12)
        };
        var otherUpcomingSlot = new Availability
        {
            PersonnelId = otherNurse.Id,
            Date = DateTime.Today.AddDays(2),
            StartTime = TimeSpan.FromHours(12),
            EndTime = TimeSpan.FromHours(13)
        };
        var completedTodaySlot = new Availability
        {
            PersonnelId = otherNurse.Id,
            Date = DateTime.Today,
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(10)
        };
        var cancelledTodaySlot = new Availability
        {
            PersonnelId = otherNurse.Id,
            Date = DateTime.Today,
            StartTime = TimeSpan.FromHours(14),
            EndTime = TimeSpan.FromHours(15)
        };
        var declinedTodaySlot = new Availability
        {
            PersonnelId = otherNurse.Id,
            Date = DateTime.Today,
            StartTime = TimeSpan.FromHours(13),
            EndTime = TimeSpan.FromHours(14)
        };
        _context.Availabilities.AddRange(
            ownPastSlot,
            otherPastSlot,
            ownUpcomingSlot,
            otherUpcomingSlot,
            completedTodaySlot,
            cancelledTodaySlot,
            declinedTodaySlot);
        await _context.SaveChangesAsync();

        var ownPast = AppointmentFor(patient.Id, ownPastSlot, "Completed");
        var otherPast = AppointmentFor(patient.Id, otherPastSlot, "Completed");
        var ownUpcoming = AppointmentFor(patient.Id, ownUpcomingSlot, "Booked");
        var otherUpcoming = AppointmentFor(patient.Id, otherUpcomingSlot, "Booked");
        var completedToday = AppointmentFor(patient.Id, completedTodaySlot, "Completed");
        var cancelledToday = AppointmentFor(patient.Id, cancelledTodaySlot, "Cancelled");
        var patientDeclinedToday = AppointmentFor(patient.Id, declinedTodaySlot, "Cancelled");
        patientDeclinedToday.PatientResponseStatus = "Declined";
        _context.Appointments.AddRange(
            ownPast,
            otherPast,
            ownUpcoming,
            otherUpcoming,
            completedToday,
            cancelledToday,
            patientDeclinedToday);
        await _context.SaveChangesAsync();

        var ownVisit = new Visit
        {
            AppointmentId = ownPast.Id,
            PatientId = patient.Id,
            ResponsibleUserId = nurse.Id,
            VisitType = "Physical",
            Status = "Completed",
            StartedAt = DateTime.UtcNow.AddDays(-2),
            CompletedAt = DateTime.UtcNow.AddDays(-2).AddMinutes(30)
        };
        var otherVisit = new Visit
        {
            AppointmentId = otherPast.Id,
            PatientId = patient.Id,
            ResponsibleUserId = otherNurse.Id,
            VisitType = "Physical",
            Status = "Completed",
            StartedAt = DateTime.UtcNow.AddDays(-1),
            CompletedAt = DateTime.UtcNow.AddDays(-1).AddMinutes(30)
        };
        var ownCall = new CallLog
        {
            PatientId = patient.Id,
            PersonnelId = nurse.Id,
            StartedAt = DateTime.UtcNow.AddMinutes(-10),
            Status = "Answered"
        };
        var otherCall = new CallLog
        {
            PatientId = patient.Id,
            PersonnelId = otherNurse.Id,
            StartedAt = DateTime.UtcNow.AddMinutes(-5),
            Status = "Missed"
        };
        _context.Visits.AddRange(ownVisit, otherVisit);
        _context.CallLogs.AddRange(ownCall, otherCall);
        await _context.SaveChangesAsync();

        var nurseController = PatientsControllerFor(nurse);
        var nurseResponse = await nurseController.GetPatientById(patient.Id);
        var nurseDetails = Assert.IsType<PatientDetailsDto>(
            Assert.IsType<OkObjectResult>(nurseResponse.Result).Value);

        Assert.Equal(2, nurseDetails.TotalAppointments);
        Assert.Equal(
            ownUpcomingSlot.Date.ToString("dd/MM/yyyy"),
            nurseDetails.LastAppointmentDate);
        Assert.Equal(nurse.Id, Assert.Single(nurseDetails.UpcomingAppointments).PersonnelId);
        var nursePast = Assert.Single(nurseDetails.PastAppointments);
        Assert.Equal(nurse.Id, nursePast.PersonnelId);
        Assert.Equal(ownVisit.Id, nursePast.VisitId);
        Assert.Equal(nurse.Id, Assert.Single(nurseDetails.RecentCalls).PersonnelId);

        // List-level statistics must use the same scope; otherwise the patient
        // table would still disclose another nurse's appointment count/date.
        var nurseListResponse = await nurseController.GetPatients();
        var nurseList = Assert.IsAssignableFrom<IEnumerable<PatientListDto>>(
            Assert.IsType<OkObjectResult>(nurseListResponse.Result).Value);
        var nurseListPatient = Assert.Single(nurseList);
        Assert.Equal(2, nurseListPatient.TotalAppointments);
        Assert.Equal(
            ownUpcomingSlot.Date.ToString("dd/MM/yyyy"),
            nurseListPatient.LastAppointmentDate);

        // A shared patient relationship does not authorize one nurse to rewrite
        // another nurse's call outcome.
        Assert.IsType<NotFoundResult>(await nurseController.UpdateCall(
            patient.Id,
            otherCall.Id,
            new CallLogUpdateDto { Status = "Answered" }));
        Assert.IsType<NoContentResult>(await nurseController.UpdateCall(
            patient.Id,
            ownCall.Id,
            new CallLogUpdateDto { Status = "Ended" }));

        var headResponse = await PatientsControllerFor(head).GetPatientById(patient.Id);
        var headDetails = Assert.IsType<PatientDetailsDto>(
            Assert.IsType<OkObjectResult>(headResponse.Result).Value);
        Assert.Equal(7, headDetails.TotalAppointments);
        Assert.Equal(
            otherUpcomingSlot.Date.ToString("dd/MM/yyyy"),
            headDetails.LastAppointmentDate);
        Assert.Equal(2, headDetails.UpcomingAppointments.Count);
        Assert.Equal(4, headDetails.PastAppointments.Count);
        Assert.Equal(
            new[] { cancelledToday.Id, completedToday.Id, otherPast.Id, ownPast.Id },
            headDetails.PastAppointments.Select(item => item.Id));
        Assert.DoesNotContain(
            headDetails.PastAppointments,
            item => item.Id == patientDeclinedToday.Id);
        Assert.Equal(2, headDetails.RecentCalls.Count);
        Assert.Contains(headDetails.PastAppointments, item => item.VisitId == otherVisit.Id);

        _context.ChangeTracker.Clear();
        Assert.Equal("Missed", (await _context.CallLogs.SingleAsync(item =>
            item.Id == otherCall.Id)).Status);
    }

    private static Appointment AppointmentFor(
        string patientId,
        Availability availability,
        string status) => new()
    {
        PatientId = patientId,
        AvailabilityId = availability.Id,
        StartTime = availability.StartTime,
        EndTime = availability.EndTime,
        Tasks = "Medication",
        Status = status
    };

    private PersonnelController PersonnelControllerFor(User user) => new(
        new UserRepository(_context),
        _access,
        _userManager,
        NullLogger<PersonnelController>.Instance)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(user) }
        }
    };

    private AvailabilityController AvailabilityControllerFor(User user) => new(
        new AvailabilityService(
            new AvailabilityRepository(_context),
            new AvailabilityWindowRepository(_context),
            new AppointmentRepository(_context),
            _context),
        _access,
        NullLogger<AvailabilityController>.Instance)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(user) }
        }
    };

    private VisitsController VisitsControllerFor(User user)
    {
        var appointmentRepository = new AppointmentRepository(_context);
        var appointmentService = new AppointmentService(
            appointmentRepository,
            new AvailabilityRepository(_context),
            new AvailabilityService(
                new AvailabilityRepository(_context),
                new AvailabilityWindowRepository(_context),
                appointmentRepository,
                _context),
            new UserRepository(_context),
            new NoopHttpClientFactory(),
            new ConfigurationBuilder().Build(),
            NullLogger<AppointmentService>.Instance);
        var visitService = new VisitService(
            new VisitRepository(_context),
            appointmentRepository,
            appointmentService,
            new CallLogRepository(_context));

        return WithUser(
            new VisitsController(
                visitService,
                appointmentService,
                _access,
                NullLogger<VisitsController>.Instance),
            user);
    }

    private PatientsController PatientsControllerFor(User user)
    {
        var userRepository = new UserRepository(_context);
        var callLogService = new CallLogService(new CallLogRepository(_context), userRepository);
        var patientService = new PatientService(
            userRepository,
            new AppointmentRepository(_context),
            new PatientUserLinkRepository(_context),
            callLogService,
            _userManager,
            _context,
            new EphemeralDataProtectionProvider());
        var profileDirectory = new SupabaseProfileDirectory(
            new NoopHttpClientFactory(),
            new ConfigurationBuilder().Build(),
            NullLogger<SupabaseProfileDirectory>.Instance);

        return WithUser(
            new PatientsController(
                patientService,
                callLogService,
                profileDirectory,
                _access,
                NullLogger<PatientsController>.Instance),
            user);
    }

    private PatientUserLinksController PatientUserLinksControllerFor(User user) =>
        WithUser(
            new PatientUserLinksController(
                new PatientUserLinkService(new PatientUserLinkRepository(_context)),
                _access,
                NullLogger<PatientUserLinksController>.Instance),
            user);

    private static TController WithUser<TController>(TController controller, User user)
        where TController : ControllerBase
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(user) }
        };
        return controller;
    }

    private async Task<User> AddUserAsync(string userName, string role)
    {
        var user = new User
        {
            UserName = userName,
            Email = userName,
            FullName = userName,
            Role = role
        };
        var created = await _userManager.CreateAsync(user);
        Assert.True(created.Succeeded, string.Join("; ", created.Errors.Select(error => error.Description)));
        var assigned = await _userManager.AddToRoleAsync(user, role);
        Assert.True(assigned.Succeeded, string.Join("; ", assigned.Errors.Select(error => error.Description)));
        return user;
    }

    private static ClaimsPrincipal PrincipalFor(User user) => new(
        new ClaimsIdentity(
            new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Role, user.Role)
            },
            "test"));

    private static UserManager<User> BuildUserManager(ApplicationDbContext context) =>
        new(
            new UserStore<User>(context),
            Options.Create(new IdentityOptions()),
            new PasswordHasher<User>(),
            new IUserValidator<User>[] { new UserValidator<User>() },
            new IPasswordValidator<User>[] { new PasswordValidator<User>() },
            new UpperInvariantLookupNormalizer(),
            new IdentityErrorDescriber(),
            null!,
            NullLogger<UserManager<User>>.Instance);

    public void Dispose()
    {
        _userManager.Dispose();
        _context.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private sealed class NoopHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
