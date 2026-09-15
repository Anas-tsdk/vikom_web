using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class AddAppointmentPatientResponse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PatientRespondedAt",
                table: "Appointments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PatientResponseStatus",
                table: "Appointments",
                type: "TEXT",
                nullable: false,
                // Appointments that existed before invitations were introduced
                // were already treated as confirmed bookings.
                defaultValue: "Accepted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PatientRespondedAt",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PatientResponseStatus",
                table: "Appointments");
        }
    }
}
