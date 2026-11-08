using backend.DAL;
using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace backend.Tests;

/// <summary>
/// The portal must never rewrite a patient's URL handle while editing their TV
/// link. <c>ProfileUsername</c> is a local, seeder-owned handle that
/// <c>/patients/{username}</c> resolves against; the Supabase username is a
/// different value that only ever appears on screen. Conflating the two renamed
/// a patient's URL mid-session and could collide on the unique handle index, so
/// these tests pin the separation down.
///
/// Runs against a real in-memory SQLite database, like
/// <see cref="UserRepositorySupabaseLookupTests"/>, so Identity and the
/// repositories behave as they do in production.
/// </summary>
public class PatientSupabaseLinkTests : IDisposable
{
    private const string IngridHandle = "ingrid.berg";
    private const string ProfileA = "c9f53a55-1375-48e6-95ce-25917f55be2d";
    private const string ProfileB = "4fb30313-b8e6-4381-896c-d345b5d3bd72";

    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;
    private readonly UserManager<User> _userManager;
    private readonly PatientService _service;

    public PatientSupabaseLinkTests()
    {
        // The connection must stay open for the lifetime of the test: an in-memory
        // SQLite database is discarded when its last connection closes.
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new ApplicationDbContext(options);
        _context.Database.EnsureCreated();

        // CreatePatientAsync assigns the "Patient" role, which Identity refuses if the
        // role row is absent. Production seeds it at startup; do the same here.
        _context.Roles.Add(new IdentityRole("Patient") { NormalizedName = "PATIENT" });
        _context.SaveChanges();

        _userManager = BuildUserManager(_context);

        var userRepository = new UserRepository(_context);

        // Every dependency takes only the context, so use the real ones rather than
        // fakes — no mocking library is present and none is needed.
        _service = new PatientService(
            userRepository,
            new AppointmentRepository(_context),
            new PatientUserLinkRepository(_context),
            new CallLogService(new CallLogRepository(_context), userRepository),
            _userManager,
            _context,
            new EphemeralDataProtectionProvider());
    }

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

    /// <summary>A seeded-style patient: a readable handle, optionally TV-linked.</summary>
    private async Task<User> AddPatientAsync(
        string userName,
        string fullName,
        string? profileUsername,
        string? supabaseProfileId = null)
    {
        var patient = new User
        {
            UserName = userName,
            Email = userName,
            FullName = fullName,
            Role = "Patient",
            EmailConfirmed = true,
            ProfileUsername = profileUsername,
            SupabaseProfileId = supabaseProfileId
        };

        var result = await _userManager.CreateAsync(patient);
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));

        return patient;
    }

    private static PatientUpdateDto UpdateDtoFor(User patient, string? supabaseProfileId) => new()
    {
        FullName = patient.FullName,
        Email = patient.Email!,
        PhoneNumber = patient.PhoneNumber,
        Address = patient.Address,
        SupabaseProfileId = supabaseProfileId
    };

    private async Task<User> ReloadAsync(string patientId)
    {
        // Detach so the assertion reads the persisted row, not the tracked instance
        // the service just mutated.
        _context.ChangeTracker.Clear();
        return (await _context.Users.AsNoTracking().FirstAsync(u => u.Id == patientId));
    }

    [Fact]
    public async Task Linking_a_supabase_profile_leaves_the_url_handle_untouched()
    {
        var patient = await AddPatientAsync("patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle);

        await _service.UpdatePatientAsync(patient.Id, UpdateDtoFor(patient, ProfileA));

        var saved = await ReloadAsync(patient.Id);
        Assert.Equal(ProfileA, saved.SupabaseProfileId);
        Assert.Equal(IngridHandle, saved.ProfileUsername);
        Assert.True(saved.DailyCheckInEnabled);
        Assert.NotNull(saved.DailyCheckInStartedAt);
    }

    [Fact]
    public async Task Patient_identity_is_protected_at_rest_and_returned_in_authorized_details()
    {
        const string socialSecurityNumber = "12345678901";
        var patient = await AddPatientAsync(
            "patient.identity@homecare.local",
            "Identity Patient",
            "identity.patient");
        var dto = UpdateDtoFor(patient, null);
        dto.SocialSecurityNumber = socialSecurityNumber;
        dto.AccessInstructions = "Use the side entrance";
        dto.MedicationEquipmentNotes = "Bring the inhaler";

        var updated = await _service.UpdatePatientAsync(patient.Id, dto);
        var saved = await ReloadAsync(patient.Id);

        Assert.Equal(socialSecurityNumber, updated?.SocialSecurityNumber);
        Assert.NotEqual(socialSecurityNumber, saved.SocialSecurityNumberProtected);
        Assert.DoesNotContain(socialSecurityNumber, saved.SocialSecurityNumberProtected);
        Assert.Equal("Use the side entrance", updated?.Clinical.AccessInstructions);
        Assert.Equal("Bring the inhaler", updated?.Clinical.MedicationEquipmentNotes);
    }

    [Fact]
    public async Task Relinking_to_a_different_profile_leaves_the_url_handle_untouched()
    {
        var patient = await AddPatientAsync(
            "patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle, ProfileA);

        await _service.UpdatePatientAsync(patient.Id, UpdateDtoFor(patient, ProfileB));

        var saved = await ReloadAsync(patient.Id);
        Assert.Equal(ProfileB, saved.SupabaseProfileId);
        Assert.Equal(IngridHandle, saved.ProfileUsername);
    }

    [Fact]
    public async Task Unlinking_clears_only_the_profile_id_and_keeps_the_url_handle()
    {
        var patient = await AddPatientAsync(
            "patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle, ProfileA);

        await _service.UpdatePatientAsync(patient.Id, UpdateDtoFor(patient, null));

        var saved = await ReloadAsync(patient.Id);
        Assert.Null(saved.SupabaseProfileId);
        Assert.Equal(IngridHandle, saved.ProfileUsername);
        Assert.False(saved.DailyCheckInEnabled);
        Assert.Null(saved.DailyCheckInStartedAt);
    }

    [Fact]
    public async Task A_portal_created_patient_has_no_url_handle_and_is_addressed_by_guid()
    {
        var nurse = await AddPatientAsync("nurse@homecare.local", "Nurse Nora", null);

        var created = await _service.CreatePatientAsync(
            new PatientCreateDto
            {
                FullName = "Ny Pasient",
                Email = "ny.pasient@homecare.local",
                SupabaseProfileId = ProfileA
            },
            nurse.Id);

        var saved = await ReloadAsync(created.Id);
        Assert.Null(saved.ProfileUsername);
        Assert.Equal(ProfileA, saved.SupabaseProfileId);
        Assert.True(saved.DailyCheckInEnabled);

        // The details DTO drives the URL the portal navigates to, and with no
        // handle it must fall back to the GUID rather than inventing one.
        Assert.Null(created.Username);
    }

    [Fact]
    public async Task A_supabase_profile_already_linked_elsewhere_is_refused_with_a_readable_message()
    {
        await AddPatientAsync("patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle, ProfileA);
        var other = await AddPatientAsync("patient.wayki@homecare.local", "Bong Wayki", "bong.wayki");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.UpdatePatientAsync(other.Id, UpdateDtoFor(other, ProfileA)));

        Assert.Contains("Ingrid Berg", error.Message);
    }

    [Fact]
    public async Task Assigned_patients_are_unioned_with_existing_care_team_links()
    {
        var nurse = await AddPatientAsync("nurse.assignments@example.test", "Nurse", null);
        var linked = await AddPatientAsync("patient.linked@example.test", "Linked Patient", null);
        var assigned = await AddPatientAsync("patient.assigned@example.test", "Assigned Patient", null);

        _context.PatientUserLinks.Add(new PatientUserLink
        {
            PatientId = linked.Id,
            SecondaryUserId = nurse.Id,
            RelationshipType = "Personnel"
        });
        var slot = new Availability
        {
            PersonnelId = nurse.Id,
            Date = DateTime.Today.AddDays(1),
            StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(10)
        };
        _context.Appointments.Add(new Appointment
        {
            PatientId = assigned.Id,
            Availability = slot,
            StartTime = slot.StartTime,
            EndTime = slot.EndTime,
            Tasks = "Care",
            Status = "Booked"
        });
        await _context.SaveChangesAsync();

        var visible = (await _service.GetLinkedPatientsAsync(nurse.Id))
            .Select(patient => patient.Id)
            .ToHashSet();

        Assert.Contains(linked.Id, visible);
        Assert.Contains(assigned.Id, visible);
    }

    [Fact]
    public async Task Re_saving_an_unchanged_link_is_not_treated_as_a_conflict()
    {
        var patient = await AddPatientAsync(
            "patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle, ProfileA);

        await _service.UpdatePatientAsync(patient.Id, UpdateDtoFor(patient, ProfileA));

        var saved = await ReloadAsync(patient.Id);
        Assert.Equal(ProfileA, saved.SupabaseProfileId);
        Assert.Equal(IngridHandle, saved.ProfileUsername);
    }

    [Fact]
    public async Task A_handle_matching_another_patients_supabase_username_does_not_block_linking()
    {
        // The regression this guards: link validation used to also check the local
        // handle, so a patient whose handle happened to equal the Supabase username
        // being linked was rejected for no real reason. The two are independent.
        await AddPatientAsync("patient.wayki@homecare.local", "Bong Wayki", "wayki");
        var patient = await AddPatientAsync("patient.ingrid@homecare.local", "Ingrid Berg", IngridHandle);

        await _service.UpdatePatientAsync(patient.Id, UpdateDtoFor(patient, ProfileB));

        var saved = await ReloadAsync(patient.Id);
        Assert.Equal(ProfileB, saved.SupabaseProfileId);
        Assert.Equal(IngridHandle, saved.ProfileUsername);
    }

    [Fact]
    public async Task Contact_coordinates_clinical_data_and_medications_are_saved_together()
    {
        var patient = await AddPatientAsync("patient.clinical@homecare.local", "Kari Nordmann", "kari.nordmann");

        var updated = await _service.UpdatePatientAsync(patient.Id, new PatientUpdateDto
        {
            FullName = patient.FullName,
            Email = patient.Email!,
            Address = "Grensen 12, 0159 Oslo",
            Latitude = 59.914,
            Longitude = 10.744,
            DateOfBirth = new DateTime(1945, 2, 3),
            NextOfKinName = "Ola Nordmann",
            NextOfKinRelation = "Sønn",
            GeneralPractitioner = "Dr. Hansen",
            Allergies = "Penicillin",
            Diagnoses = ["Diabetes type 2", "Hypertensjon"],
            ConditionFlags = ["Bruker rullator"],
            TreatmentPlan = "Ukentlig oppfølging",
            Medications =
            [
                new MedicationDto { Name = "Metformin", Dosage = "500 mg", Schedule = "Morgen og kveld" },
                new MedicationDto { Name = "Amlodipin", Dosage = "5 mg", Schedule = "Morgen" },
            ],
        });

        Assert.NotNull(updated);
        Assert.Equal(59.914, updated.Latitude);
        Assert.Equal(10.744, updated.Longitude);
        Assert.Equal("Dr. Hansen", updated.Clinical.GeneralPractitioner);
        Assert.Equal(2, updated.Clinical.Diagnoses.Count);
        Assert.Equal(2, updated.Clinical.Medications.Count);
        Assert.Equal("Metformin", updated.Clinical.Medications[0].Name);

        _context.ChangeTracker.Clear();
        Assert.Equal(2, await _context.PatientMedications.CountAsync(m => m.PatientId == patient.Id));
    }

    [Fact]
    public async Task Repeated_patient_saves_replace_medications_without_duplicating_them()
    {
        var patient = await AddPatientAsync(
            "patient.medication@homecare.local",
            "Medisin Pasient",
            "medisin.pasient");

        // Reproduce the production state: the medicine exists in the database,
        // but the patient is loaded in a fresh request without its navigation.
        _context.PatientMedications.Add(new PatientMedication
        {
            PatientId = patient.Id,
            Name = "Ciscutan",
            Dosage = "50 mg",
            Schedule = "2 ganger daglig",
            SortOrder = 0,
        });
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        var update = UpdateDtoFor(patient, null);
        update.Medications =
        [
            new MedicationDto { Name = "Ciscutan", Dosage = "50 mg", Schedule = "2 ganger daglig" },
            // A duplicated client row must not recreate the database problem.
            new MedicationDto { Name = " ciscutan ", Dosage = " 50 mg ", Schedule = " 2 ganger daglig " },
        ];

        await _service.UpdatePatientAsync(patient.Id, update);
        _context.ChangeTracker.Clear();
        await _service.UpdatePatientAsync(patient.Id, update);
        _context.ChangeTracker.Clear();

        var saved = await _context.PatientMedications
            .AsNoTracking()
            .Where(m => m.PatientId == patient.Id)
            .ToListAsync();

        var medication = Assert.Single(saved);
        Assert.Equal("Ciscutan", medication.Name);
        Assert.Equal("50 mg", medication.Dosage);
        Assert.Equal("2 ganger daglig", medication.Schedule);
        Assert.Equal(0, medication.SortOrder);
    }

    public void Dispose()
    {
        _userManager.Dispose();
        _context.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }
}
