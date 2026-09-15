using System;
using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260911170000_PreserveDeclinedAppointmentSlots")]
    public partial class PreserveDeclinedAppointmentSlots : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DeclinedAppointmentSlots",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PatientId = table.Column<string>(type: "TEXT", nullable: false),
                    Date = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    EndTime = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeclinedAppointmentSlots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeclinedAppointmentSlots_AspNetUsers_PatientId",
                        column: x => x.PatientId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DeclinedAppointmentSlots_PatientId_Date",
                table: "DeclinedAppointmentSlots",
                columns: new[] { "PatientId", "Date" });

            migrationBuilder.Sql(
                """
                INSERT INTO DeclinedAppointmentSlots
                    (PatientId, Date, StartTime, EndTime, RecordedAt)
                SELECT a.PatientId, av.Date, a.StartTime, a.EndTime,
                       COALESCE(a.PatientRespondedAt, CURRENT_TIMESTAMP)
                FROM Appointments a
                INNER JOIN Availabilities av ON av.Id = a.AvailabilityId
                WHERE a.Status = 'Cancelled'
                  AND a.PatientResponseStatus = 'Declined';
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "DeclinedAppointmentSlots");
        }
    }
}
