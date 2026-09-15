using System;
using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260911120000_AddAppointmentRescheduleProposal")]
    public partial class AddAppointmentRescheduleProposal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PatientProposedDate",
                table: "Appointments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<TimeSpan>(
                name: "PatientProposedEndTime",
                table: "Appointments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<TimeSpan>(
                name: "PatientProposedStartTime",
                table: "Appointments",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PatientProposedDate",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PatientProposedEndTime",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PatientProposedStartTime",
                table: "Appointments");
        }
    }
}
