using backend.DAL;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <summary>
    /// Data-only migration from the former catch-all Personnel role to the
    /// canonical Nurse/HeadNurse roles. The Personnel role itself remains so
    /// already-issued legacy JWTs can pass the transition policy until expiry.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260910213000_AddNurseRoles")]
    public sealed class AddNurseRoles : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                INSERT OR IGNORE INTO AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
                VALUES ('vikom-role-nurse', 'Nurse', 'NURSE', NULL);

                INSERT OR IGNORE INTO AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
                VALUES ('vikom-role-head-nurse', 'HeadNurse', 'HEADNURSE', NULL);

                UPDATE AspNetUsers
                SET Role = 'HeadNurse'
                WHERE Role = 'Personnel'
                  AND NormalizedUserName = 'NURSE@HOMECARE.LOCAL';

                UPDATE AspNetUsers
                SET Role = 'Nurse'
                WHERE Role = 'Personnel';

                DELETE FROM AspNetUserRoles
                WHERE UserId IN (
                    SELECT Id FROM AspNetUsers WHERE Role IN ('Nurse', 'HeadNurse')
                )
                AND RoleId IN (
                    SELECT Id FROM AspNetRoles
                    WHERE NormalizedName IN ('PERSONNEL', 'NURSE', 'HEADNURSE')
                );

                INSERT OR IGNORE INTO AspNetUserRoles (UserId, RoleId)
                SELECT users.Id, roles.Id
                FROM AspNetUsers AS users
                JOIN AspNetRoles AS roles
                  ON roles.NormalizedName = CASE users.Role
                      WHEN 'Nurse' THEN 'NURSE'
                      WHEN 'HeadNurse' THEN 'HEADNURSE'
                  END
                WHERE users.Role IN ('Nurse', 'HeadNurse');
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                INSERT OR IGNORE INTO AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
                VALUES ('vikom-role-personnel', 'Personnel', 'PERSONNEL', NULL);

                DELETE FROM AspNetUserRoles
                WHERE UserId IN (
                    SELECT Id FROM AspNetUsers WHERE Role IN ('Nurse', 'HeadNurse')
                )
                AND RoleId IN (
                    SELECT Id FROM AspNetRoles
                    WHERE NormalizedName IN ('NURSE', 'HEADNURSE')
                );

                UPDATE AspNetUsers
                SET Role = 'Personnel'
                WHERE Role IN ('Nurse', 'HeadNurse');

                INSERT OR IGNORE INTO AspNetUserRoles (UserId, RoleId)
                SELECT users.Id, roles.Id
                FROM AspNetUsers AS users
                JOIN AspNetRoles AS roles ON roles.NormalizedName = 'PERSONNEL'
                WHERE users.Role = 'Personnel';

                DELETE FROM AspNetRoles WHERE NormalizedName IN ('NURSE', 'HEADNURSE');
                """);
        }
    }
}
