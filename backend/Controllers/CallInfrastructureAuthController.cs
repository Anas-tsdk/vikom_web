using System.Security.Claims;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

/// <summary>
/// Lets the Supabase call-infrastructure function validate a portal JWT without
/// copying the portal signing key into a third-party secret store. The function
/// forwards the caller's bearer token over HTTPS; normal ASP.NET authentication
/// remains the authority and only the authenticated staff identifier is returned.
/// </summary>
[ApiController]
[Route("api/call-auth")]
public sealed class CallInfrastructureAuthController : ControllerBase
{
    [Authorize(AuthenticationSchemes =
        JwtBearerDefaults.AuthenticationScheme + "," + SupabaseAuthentication.Scheme)]
    [HttpPost("validate")]
    public IActionResult Validate()
    {
        // Supabase keeps its subject as `sub` (MapInboundClaims is disabled for
        // that scheme). Any successfully validated Supabase account may use the
        // app-to-app call transport, whether or not it is a portal patient.
        var supabaseId = User.FindFirstValue("sub")?.Trim();
        if (Guid.TryParse(supabaseId, out _))
        {
            return Ok(new { actorId = supabaseId });
        }

        // The portal scheme uses ASP.NET's name-identifier claim. Keep its
        // existing staff-only rule even though this endpoint accepts both JWT
        // issuers.
        var portalId = User.FindFirstValue(ClaimTypes.NameIdentifier)?.Trim();
        var isPortalStaff = UserRoles.PortalStaff.Any(User.IsInRole);
        return !string.IsNullOrWhiteSpace(portalId) && isPortalStaff
            ? Ok(new { actorId = portalId })
            : Forbid();
    }
}
