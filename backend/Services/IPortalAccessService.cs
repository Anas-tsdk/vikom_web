using System.Security.Claims;

namespace backend.Services
{
    /// <summary>
    /// Resource-level access checks for the personnel portal. Authorization
    /// attributes establish that the caller is staff; this service decides
    /// whether that staff member may see or change a particular nurse/patient.
    /// Current database roles are used so a promotion or demotion takes effect
    /// without waiting for an already-issued JWT to expire.
    /// </summary>
    public interface IPortalAccessService
    {
        string? GetUserId(ClaimsPrincipal principal);
        Task<bool> IsHeadNurseAsync(ClaimsPrincipal principal);
        Task<bool> CanViewPersonnelAsync(ClaimsPrincipal principal, string personnelId);
        Task<bool> CanManagePersonnelAsync(ClaimsPrincipal principal, string personnelId);
        Task<bool> CanAccessPatientAsync(ClaimsPrincipal principal, string patientId);
        Task<bool> IsPortalStaffAsync(string userId);
    }
}
