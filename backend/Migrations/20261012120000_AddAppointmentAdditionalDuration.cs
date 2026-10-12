using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261012120000_AddAppointmentAdditionalDuration")]
    public partial class AddAppointmentAdditionalDuration : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AdditionalDurationMinutes",
                table: "Appointments",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER TR_Appointments_PreventOverlappingNurseVisits_Insert
                BEFORE INSERT ON Appointments
                WHEN NEW.Status <> 'Cancelled'
                BEGIN
                    SELECT RAISE(ABORT, 'Nurse appointments cannot overlap')
                    WHERE EXISTS (
                        SELECT 1
                        FROM Appointments existing
                        JOIN Availabilities existingAvailability
                            ON existingAvailability.Id = existing.AvailabilityId
                        JOIN Availabilities newAvailability
                            ON newAvailability.Id = NEW.AvailabilityId
                        WHERE existing.Status <> 'Cancelled'
                          AND existingAvailability.PersonnelId = newAvailability.PersonnelId
                          AND existingAvailability.Date = newAvailability.Date
                          AND existing.StartTime < NEW.EndTime
                          AND NEW.StartTime < existing.EndTime
                    );
                END;
                """);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER TR_Appointments_PreventOverlappingNurseVisits_Update
                BEFORE UPDATE OF AvailabilityId, StartTime, EndTime, Status ON Appointments
                WHEN NEW.Status <> 'Cancelled'
                BEGIN
                    SELECT RAISE(ABORT, 'Nurse appointments cannot overlap')
                    WHERE EXISTS (
                        SELECT 1
                        FROM Appointments existing
                        JOIN Availabilities existingAvailability
                            ON existingAvailability.Id = existing.AvailabilityId
                        JOIN Availabilities newAvailability
                            ON newAvailability.Id = NEW.AvailabilityId
                        WHERE existing.Id <> NEW.Id
                          AND existing.Status <> 'Cancelled'
                          AND existingAvailability.PersonnelId = newAvailability.PersonnelId
                          AND existingAvailability.Date = newAvailability.Date
                          AND existing.StartTime < NEW.EndTime
                          AND NEW.StartTime < existing.EndTime
                    );
                END;
                """);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER TR_Appointments_PreventOverlappingPatientVisits_Insert
                BEFORE INSERT ON Appointments
                WHEN NEW.Status <> 'Cancelled'
                BEGIN
                    SELECT RAISE(ABORT, 'Patient appointments cannot overlap')
                    WHERE EXISTS (
                        SELECT 1
                        FROM Appointments existing
                        JOIN Availabilities existingAvailability
                            ON existingAvailability.Id = existing.AvailabilityId
                        JOIN Availabilities newAvailability
                            ON newAvailability.Id = NEW.AvailabilityId
                        WHERE existing.Status <> 'Cancelled'
                          AND existing.PatientId = NEW.PatientId
                          AND existingAvailability.Date = newAvailability.Date
                          AND existing.StartTime < NEW.EndTime
                          AND NEW.StartTime < existing.EndTime
                    );
                END;
                """);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER TR_Appointments_PreventOverlappingPatientVisits_Update
                BEFORE UPDATE OF PatientId, AvailabilityId, StartTime, EndTime, Status ON Appointments
                WHEN NEW.Status <> 'Cancelled'
                BEGIN
                    SELECT RAISE(ABORT, 'Patient appointments cannot overlap')
                    WHERE EXISTS (
                        SELECT 1
                        FROM Appointments existing
                        JOIN Availabilities existingAvailability
                            ON existingAvailability.Id = existing.AvailabilityId
                        JOIN Availabilities newAvailability
                            ON newAvailability.Id = NEW.AvailabilityId
                        WHERE existing.Id <> NEW.Id
                          AND existing.Status <> 'Cancelled'
                          AND existing.PatientId = NEW.PatientId
                          AND existingAvailability.Date = newAvailability.Date
                          AND existing.StartTime < NEW.EndTime
                          AND NEW.StartTime < existing.EndTime
                    );
                END;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_Appointments_PreventOverlappingNurseVisits_Insert;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_Appointments_PreventOverlappingNurseVisits_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_Appointments_PreventOverlappingPatientVisits_Insert;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_Appointments_PreventOverlappingPatientVisits_Update;");
            migrationBuilder.DropColumn(
                name: "AdditionalDurationMinutes",
                table: "Appointments");
        }
    }
}
