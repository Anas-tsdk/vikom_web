using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <summary>
    /// Reconciles the model with a schema it already had.
    ///
    /// IX_AspNetUsers_SupabaseProfileId has existed in the database since
    /// <c>AddSupabaseProfileId</c>, but the unique index had gone missing from
    /// <c>ApplicationDbContext.OnModelCreating</c>, so the model snapshot no
    /// longer described it. Two consequences: databases built by
    /// <c>EnsureCreated</c> (the test fixtures) silently lacked the constraint,
    /// and the next scaffolded migration would have generated a DropIndex for a
    /// constraint we very much want to keep.
    ///
    /// The declaration is now back in OnModelCreating, and this migration exists
    /// to record that in the snapshot. The scaffolded body was a plain
    /// CreateIndex, which would have failed on every database — fresh ones
    /// included, since AddSupabaseProfileId creates the index earlier in the same
    /// run. Raw idempotent SQL instead: a no-op where the index is already
    /// present (the normal case), and a repair where it went missing.
    /// </summary>
    public partial class SyncSupabaseProfileIdUniqueIndex : Migration
    {
        private const string IndexName = "IX_AspNetUsers_SupabaseProfileId";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                $"CREATE UNIQUE INDEX IF NOT EXISTS \"{IndexName}\" " +
                "ON \"AspNetUsers\" (\"SupabaseProfileId\");");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // IF EXISTS so rolling back is safe whichever migration created it.
            migrationBuilder.Sql($"DROP INDEX IF EXISTS \"{IndexName}\";");
        }
    }
}
