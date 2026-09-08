using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class AddSupabaseProfileId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SupabaseProfileId",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true,
                comment: "Optional UUID from Supabase profiles.id for Cart's TV app integration");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_SupabaseProfileId",
                table: "AspNetUsers",
                column: "SupabaseProfileId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_SupabaseProfileId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SupabaseProfileId",
                table: "AspNetUsers");
        }
    }
}
