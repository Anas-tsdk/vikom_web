using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <summary>
    /// Deletes the demo patient "Erik Johansen" (`patient@homecare.local`) and
    /// everything that referenced him. He was dropped from the seed set because
    /// he duplicated Ingrid Berg without covering any case she did not.
    ///
    /// Removing him from <c>DBInit</c> only stops new databases from getting
    /// him; the row survives in every database that already exists, and those
    /// are local SQLite files that are never re-created. Hence a migration: it
    /// runs exactly once per database and is recorded in
    /// <c>__EFMigrationsHistory</c>, so the seeder stays a description of the
    /// state we want rather than a log of states we have left behind.
    ///
    /// The deletes are ordered by foreign key, because the Visit, CallLog and
    /// PatientMedication relationships to AspNetUsers are Restrict: the account
    /// row cannot go until everything pointing at it is gone.
    /// </summary>
    public partial class RemoveErikDemoPatient : Migration
    {
        private const string ErikId =
            "(SELECT Id FROM AspNetUsers WHERE NormalizedUserName = 'PATIENT@HOMECARE.LOCAL')";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Call logs first: they point at both the patient and the visit, and
            // the visit link is SetNull, so deleting visits first would quietly
            // orphan the attempts instead of removing them.
            migrationBuilder.Sql($@"
                DELETE FROM CallLogs
                WHERE PatientId IN {ErikId} OR PersonnelId IN {ErikId};");

            // Visit tasks are cascade-deleted by EF, but raw SQL does not go
            // through EF, and SQLite only cascades when foreign keys are
            // enforced for the connection. Delete them explicitly.
            migrationBuilder.Sql($@"
                DELETE FROM VisitTasks
                WHERE VisitId IN (
                    SELECT Id FROM Visits
                    WHERE PatientId IN {ErikId} OR ResponsibleUserId IN {ErikId});");

            migrationBuilder.Sql($@"
                DELETE FROM Visits
                WHERE PatientId IN {ErikId} OR ResponsibleUserId IN {ErikId};");

            // The nurse slots these appointments were booked into were invented
            // by the seeder to host them, so they go too. Deleting the slot
            // cascades the appointment away where foreign keys are enforced;
            // the next statement covers the case where they are not.
            migrationBuilder.Sql($@"
                DELETE FROM Availabilities
                WHERE Id IN (SELECT AvailabilityId FROM Appointments WHERE PatientId IN {ErikId});");

            migrationBuilder.Sql($@"
                DELETE FROM Appointments
                WHERE PatientId IN {ErikId};");

            migrationBuilder.Sql($@"
                DELETE FROM PatientMedications
                WHERE PatientId IN {ErikId};");

            migrationBuilder.Sql($@"
                DELETE FROM PatientUserLinks
                WHERE PatientId IN {ErikId} OR SecondaryUserId IN {ErikId};");

            // Identity's own side tables, which UserManager.DeleteAsync would
            // normally take care of.
            migrationBuilder.Sql($"DELETE FROM AspNetUserRoles WHERE UserId IN {ErikId};");
            migrationBuilder.Sql($"DELETE FROM AspNetUserClaims WHERE UserId IN {ErikId};");
            migrationBuilder.Sql($"DELETE FROM AspNetUserLogins WHERE UserId IN {ErikId};");
            migrationBuilder.Sql($"DELETE FROM AspNetUserTokens WHERE UserId IN {ErikId};");

            migrationBuilder.Sql(
                "DELETE FROM AspNetUsers WHERE NormalizedUserName = 'PATIENT@HOMECARE.LOCAL';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately empty. This migration deletes demo data, and the
            // appointments, visits and call attempts that hung off Erik cannot
            // be reconstructed from the schema. To get a full demo set back,
            // delete the local database and let the seeder rebuild it (see the
            // reset instructions in README.md).
        }
    }
}
