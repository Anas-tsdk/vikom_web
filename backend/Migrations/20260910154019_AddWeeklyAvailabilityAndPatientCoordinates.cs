using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class AddWeeklyAvailabilityAndPatientCoordinates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AvailabilityWindows_PersonnelId",
                table: "AvailabilityWindows");

            migrationBuilder.AddColumn<bool>(
                name: "IsGeneratedFromWeeklySchedule",
                table: "AvailabilityWindows",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "AspNetUsers",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "AspNetUsers",
                type: "REAL",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WeeklyAvailabilityRules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PersonnelId = table.Column<string>(type: "TEXT", nullable: false),
                    DayOfWeek = table.Column<int>(type: "INTEGER", nullable: false),
                    IsAvailable = table.Column<bool>(type: "INTEGER", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    EndTime = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeeklyAvailabilityRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WeeklyAvailabilityRules_AspNetUsers_PersonnelId",
                        column: x => x.PersonnelId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityWindows_PersonnelId_Date",
                table: "AvailabilityWindows",
                columns: new[] { "PersonnelId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyAvailabilityRules_PersonnelId_DayOfWeek",
                table: "WeeklyAvailabilityRules",
                columns: new[] { "PersonnelId", "DayOfWeek" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WeeklyAvailabilityRules");

            migrationBuilder.DropIndex(
                name: "IX_AvailabilityWindows_PersonnelId_Date",
                table: "AvailabilityWindows");

            migrationBuilder.DropColumn(
                name: "IsGeneratedFromWeeklySchedule",
                table: "AvailabilityWindows");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "AspNetUsers");

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityWindows_PersonnelId",
                table: "AvailabilityWindows",
                column: "PersonnelId");
        }
    }
}
