using System.Net;
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

public class AppointmentRealtimeTransportTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly ApplicationDbContext _context;

    public AppointmentRealtimeTransportTests()
    {
        _connection.Open();
        _context = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(_connection).Options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task Creating_appointment_broadcasts_pending_invitation_to_linked_profile()
    {
        var personnel = new User { Id = "nurse", UserName = "nurse", FullName = "Nurse", Role = "Personnel" };
        var patient = new User
        {
            Id = "patient",
            UserName = "patient",
            FullName = "Patient",
            Role = "Patient",
            SupabaseProfileId = "7d7adf47-63a5-43bf-a682-98bad1bd7c35"
        };
        var availability = new Availability
        {
            Personnel = personnel,
            Date = DateTime.Today.AddDays(2),
            StartTime = TimeSpan.FromHours(10),
            EndTime = TimeSpan.FromHours(11)
        };
        _context.AddRange(patient, availability);
        await _context.SaveChangesAsync();

        var handler = new RecordingHandler();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["Supabase:Url"] = "https://example.supabase.co",
                ["Supabase:ServiceRoleKey"] = "server-secret"
            }).Build();
        var service = new AppointmentService(
            new AppointmentRepository(_context),
            new AvailabilityRepository(_context),
            new AvailabilityService(
                new AvailabilityRepository(_context),
                new AvailabilityWindowRepository(_context),
                new AppointmentRepository(_context),
                _context),
            new UserRepository(_context),
            new TestHttpClientFactory(new HttpClient(handler)),
            configuration,
            NullLogger<AppointmentService>.Instance);

        var created = await service.CreateAsync(new AppointmentDto
        {
            PatientId = patient.Id,
            AvailabilityId = availability.Id,
            Tasks = "Medication"
        });

        Assert.Equal("Pending", created.PatientResponseStatus);
        Assert.Equal(2, handler.RequestCount);
        Assert.EndsWith(
            "/realtime/v1/api/broadcast/webrtc-signaling/events/message",
            handler.RequestUri);
        Assert.Contains(patient.SupabaseProfileId, handler.RequestBodies);
        Assert.Contains("appointment_staff_event", handler.RequestBodies);
        Assert.Contains("patientResponseStatus", handler.RequestBodies);
        Assert.Contains("Pending", handler.RequestBodies);
    }

    private sealed class TestHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }
        public string RequestUri { get; private set; } = string.Empty;
        public string RequestBody { get; private set; } = string.Empty;
        public string RequestBodies { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            RequestUri = request.RequestUri?.ToString() ?? string.Empty;
            RequestBody = request.Content == null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            RequestBodies += RequestBody;
            return new HttpResponseMessage(HttpStatusCode.Accepted);
        }
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }
}
