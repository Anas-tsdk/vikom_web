using System.Security.Claims;
using backend.DAL;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services
{
    public sealed class PortalAccessService : IPortalAccessService
    {
        private readonly ApplicationDbContext _context;

        public PortalAccessService(ApplicationDbContext context)
        {
            _context = context;
        }

        public string? GetUserId(ClaimsPrincipal principal) =>
            principal.FindFirstValue(ClaimTypes.NameIdentifier);

        public async Task<bool> IsHeadNurseAsync(ClaimsPrincipal principal)
        {
            var userId = GetUserId(principal);
            if (string.IsNullOrWhiteSpace(userId)) return false;

            return await _context.Users.AnyAsync(user =>
                user.Id == userId && user.Role == UserRoles.HeadNurse);
        }

        public async Task<bool> CanManagePersonnelAsync(
            ClaimsPrincipal principal,
            string personnelId)
        {
            var userId = GetUserId(principal);
            if (string.IsNullOrWhiteSpace(userId) ||
                string.IsNullOrWhiteSpace(personnelId))
            {
                return false;
            }

            // A head nurse may manage every staff member, not every arbitrary
            // user ID. Keep patient and unknown IDs out of staff-scoped APIs.
            if (!await IsPortalStaffAsync(personnelId)) return false;

            return string.Equals(userId, personnelId, StringComparison.Ordinal) ||
                   await IsHeadNurseAsync(principal);
        }

        public async Task<bool> CanAccessPatientAsync(
            ClaimsPrincipal principal,
            string patientIdOrProfileUsername)
        {
            var userId = GetUserId(principal);
            if (string.IsNullOrWhiteSpace(userId) ||
                string.IsNullOrWhiteSpace(patientIdOrProfileUsername))
            {
                return false;
            }

            // Patient detail URLs use the friendly ProfileUsername when one is
            // available, while relationships and appointments store the GUID.
            // Resolve either route form before applying ownership checks.
            var patientId = await _context.Users
                .Where(patient =>
                    patient.Role == UserRoles.Patient &&
                    (patient.Id == patientIdOrProfileUsername ||
                     patient.ProfileUsername == patientIdOrProfileUsername))
                .Select(patient => patient.Id)
                .SingleOrDefaultAsync();
            if (patientId == null) return false;

            if (await IsHeadNurseAsync(principal)) return true;

            // A direct care-team link is the normal source of access. The
            // appointment/visit checks retain access to historical records made
            // before links were introduced and avoid orphaning existing data.
            return await _context.PatientUserLinks.AnyAsync(link =>
                       link.PatientId == patientId &&
                       link.SecondaryUserId == userId) ||
                   await _context.Appointments.AnyAsync(appointment =>
                       appointment.PatientId == patientId &&
                       appointment.Availability.PersonnelId == userId) ||
                   await _context.Visits.AnyAsync(visit =>
                       visit.PatientId == patientId &&
                       visit.ResponsibleUserId == userId);
        }

        public Task<bool> IsPortalStaffAsync(string userId) =>
            _context.Users.AnyAsync(user =>
                user.Id == userId &&
                (user.Role == UserRoles.Nurse ||
                 user.Role == UserRoles.HeadNurse ||
                 user.Role == UserRoles.LegacyPersonnel));
    }
}
