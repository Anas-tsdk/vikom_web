using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261108110000_AddPatientIdentityAndVisitNotes")]
    public partial class AddPatientIdentityAndVisitNotes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SocialSecurityNumberProtected",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AccessInstructions",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MedicationEquipmentNotes",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SocialSecurityNumberProtected",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "AccessInstructions",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "MedicationEquipmentNotes",
                table: "AspNetUsers");
        }
    }
}
