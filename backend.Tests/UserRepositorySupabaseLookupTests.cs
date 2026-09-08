using backend.DAL;
using backend.DAL.Repositories;
using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Covers the reverse lookup the TV endpoint depends on: Supabase profile UUID to
/// local user. Runs against a real in-memory SQLite database so the comparison
/// semantics match production (SQLite '=' on TEXT is case-sensitive).
/// </summary>
public class UserRepositorySupabaseLookupTests : IDisposable
{
    private const string IngridProfileId = "c9f53a55-1375-48e6-95ce-25917f55be2d";

    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _context;
    private readonly UserRepository _repository;

    public UserRepositorySupabaseLookupTests()
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

        _context.Users.AddRange(
            new User
            {
                Id = "ingrid-local-id",
                UserName = "patient.ingrid@homecare.local",
                FullName = "Ingrid Berg",
                Role = "Patient",
                SupabaseProfileId = IngridProfileId
            },
            new User
            {
                Id = "unlinked-local-id",
                UserName = "patient.unlinked@homecare.local",
                FullName = "Unlinked Patient",
                Role = "Patient",
                SupabaseProfileId = null
            });

        _context.SaveChanges();

        _repository = new UserRepository(_context);
    }

    [Fact]
    public async Task ReturnsTheUserLinkedToThatProfile()
    {
        var user = await _repository.GetBySupabaseProfileIdAsync(IngridProfileId);

        Assert.NotNull(user);
        Assert.Equal("ingrid-local-id", user!.Id);
        Assert.Equal("Ingrid Berg", user.FullName);
    }

    [Fact]
    public async Task ReturnsNull_ForAnUnknownProfileId()
    {
        var user = await _repository.GetBySupabaseProfileIdAsync(
            "00000000-0000-0000-0000-000000000000");

        Assert.Null(user);
    }

    [Fact]
    public async Task ReturnsNull_WhenTheProfileIdHasSurroundingWhitespace()
    {
        // Documents that trimming is the caller's responsibility — the controller
        // does it before calling in.
        var user = await _repository.GetBySupabaseProfileIdAsync($" {IngridProfileId} ");

        Assert.Null(user);
    }

    [Fact]
    public async Task DoesNotMatchUsersWithNoProfileLinked()
    {
        var user = await _repository.GetBySupabaseProfileIdAsync("");

        Assert.Null(user);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }
}
