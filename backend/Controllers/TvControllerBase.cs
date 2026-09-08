using backend.DAL.Repositories;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers
{
    /// <summary>
    /// Shared base for the device-facing TV endpoints.
    ///
    /// Every TV endpoint begins the same way: take the Supabase profile id off the
    /// token, map it to a local user, and refuse anyone who is not a patient. That
    /// sequence lives here rather than being copy-pasted per controller, so a change
    /// to the rules cannot apply to one endpoint and miss another.
    ///
    /// Authenticates Supabase-issued tokens, since the TV app signs its patients in
    /// against Supabase rather than against this backend.
    /// </summary>
    [Authorize(AuthenticationSchemes = SupabaseAuthentication.Scheme)]
    [ApiController]
    public abstract class TvControllerBase : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly ILogger _logger;

        protected TvControllerBase(IUserRepository userRepository, ILogger logger)
        {
            _userRepository = userRepository;
            _logger = logger;
        }

        /// <summary>
        /// Resolves the caller to a local patient.
        ///
        /// Returns the user on success, or the <see cref="ActionResult"/> the action
        /// should return. Exactly one of the two is non-null, so callers read as
        /// <c>if (error != null) return error;</c> and carry on with a non-null user.
        /// </summary>
        protected async Task<(User? User, ActionResult? Error)> ResolveCallerAsync()
        {
            // "sub" rather than ClaimTypes.NameIdentifier: the Supabase scheme sets
            // MapInboundClaims = false so this stays the Supabase profile UUID and
            // can't be confused with our own Identity GUID.
            var supabaseProfileId = User.FindFirstValue("sub")?.Trim();

            if (string.IsNullOrEmpty(supabaseProfileId))
            {
                return (null, Unauthorized());
            }

            var user = await _userRepository.GetBySupabaseProfileIdAsync(supabaseProfileId);

            if (user == null)
            {
                // A 404 rather than an empty payload, on purpose. An unmapped profile
                // is a configuration fault, and an empty result would make it
                // indistinguishable from "you genuinely have nothing" — the TV app
                // surfaces it as its own distinct "not linked" state instead. This log
                // line is the quickest way to diagnose it.
                _logger.LogWarning(
                    "No local user is linked to Supabase profile {SupabaseProfileId}",
                    supabaseProfileId);

                return (null, NotFound("No patient is linked to this Supabase profile."));
            }

            if (user.Role != "Patient")
            {
                _logger.LogWarning(
                    "User {UserId} with role {Role} is linked to Supabase profile " +
                    "{SupabaseProfileId} but is not a patient",
                    user.Id,
                    user.Role,
                    supabaseProfileId);

                return (null, Forbid());
            }

            return (user, null);
        }
    }
}
