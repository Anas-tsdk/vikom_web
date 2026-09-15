using System;
using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260911183000_AddDailySafetyCheckIns")]
    public partial class AddDailySafetyCheckIns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DailyCheckInEnabled",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DailyCheckInStartedAt",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastDailyCheckInAt",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastDailyCheckInSource",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastDailyCheckInConfirmedByUserId",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            // Existing linked patients enter monitoring today, so deploying the
            // feature can never create an immediate three-day false alarm.
            migrationBuilder.Sql(
                """
                UPDATE AspNetUsers
                SET DailyCheckInEnabled = 1,
                    DailyCheckInStartedAt = CURRENT_TIMESTAMP
                WHERE Role = 'Patient' AND SupabaseProfileId IS NOT NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "DailyCheckInEnabled", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "DailyCheckInStartedAt", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "LastDailyCheckInAt", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "LastDailyCheckInSource", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "LastDailyCheckInConfirmedByUserId", table: "AspNetUsers");
        }
    }
}
