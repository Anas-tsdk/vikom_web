using backend.DAL.Repositories;
using backend.DTOs;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers
{
    [Route("api/tv/check-ins")]
    public sealed class TvDailyCheckInsController : TvControllerBase
    {
        private readonly IDailyCheckInService _checkIns;

        public TvDailyCheckInsController(
            IDailyCheckInService checkIns,
            IUserRepository users,
            ILogger<TvDailyCheckInsController> logger) : base(users, logger)
        {
            _checkIns = checkIns;
        }

        [HttpGet("status")]
        public async Task<ActionResult<DailyCheckInStatusDto>> GetStatus()
        {
            var (patient, error) = await ResolveCallerAsync();
            if (error != null) return error;
            return Ok(_checkIns.GetStatus(patient!));
        }

        [HttpPost("today")]
        public async Task<ActionResult<DailyCheckInStatusDto>> ConfirmToday()
        {
            var (patient, error) = await ResolveCallerAsync();
            if (error != null) return error;
            if (!patient!.DailyCheckInEnabled) return Forbid();
            return Ok(await _checkIns.ConfirmByPatientAsync(patient));
        }
    }

    [Authorize(Policy = AuthorizationPolicies.HeadNurse)]
    [ApiController]
    [Route("api/check-ins")]
    public sealed class DailyCheckInsController : ControllerBase
    {
        private readonly IDailyCheckInService _checkIns;

        public DailyCheckInsController(IDailyCheckInService checkIns)
        {
            _checkIns = checkIns;
        }

        [HttpGet("alerts")]
        public async Task<ActionResult<IReadOnlyList<DailyCheckInAlertDto>>> GetAlerts() =>
            Ok(await _checkIns.GetAlertsAsync());

        [HttpPost("patients/{patientId}/confirm")]
        public async Task<IActionResult> ConfirmPatientIsOkay(string patientId)
        {
            var personnelId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(personnelId)) return Unauthorized();
            return await _checkIns.ConfirmByPersonnelAsync(patientId, personnelId)
                ? NoContent()
                : NotFound();
        }
    }
}
