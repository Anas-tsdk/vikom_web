using backend.DAL.Repositories;
using backend.DTOs;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

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

}
