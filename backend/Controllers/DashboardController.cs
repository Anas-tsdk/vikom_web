using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.Services;
using System.Security.Claims;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Roles = "Personnel")]
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly IDashboardService _dashboardService;
        private readonly ILogger<DashboardController> _logger;

        public DashboardController(
            IDashboardService dashboardService,
            ILogger<DashboardController> logger)
        {
            _dashboardService = dashboardService;
            _logger = logger;
        }

        // GET: api/dashboard/personnel/{personnelId}
        [Authorize(Roles = "Personnel")]
        [HttpGet("personnel/{personnelId}")]
        public async Task<ActionResult<PersonnelDashboardDto>> GetPersonnelDashboard(string personnelId)
        {
            try
            {
                var dashboard = await _dashboardService.GetPersonnelDashboardAsync(personnelId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel dashboard for {PersonnelId}", personnelId);
                return StatusCode(500, "An error occurred while retrieving the dashboard");
            }
        }

        // GET: api/dashboard/personnel (uses logged-in user ID)
        [Authorize(Roles = "Personnel")]
        [HttpGet("personnel")]
        public async Task<ActionResult<PersonnelDashboardDto>> GetMyPersonnelDashboard()
        {
            try
            {
                var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized();

                var dashboard = await _dashboardService.GetPersonnelDashboardAsync(userId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel dashboard");
                return StatusCode(500, "An error occurred while retrieving the dashboard");
            }
        }

        // GET: api/dashboard/patient/{patientId}
        [HttpGet("patient/{patientId}")]
        public async Task<ActionResult<PatientDashboardDto>> GetPatientDashboard(string patientId)
        {
            try
            {
                var dashboard = await _dashboardService.GetPatientDashboardAsync(patientId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting patient dashboard for {PatientId}", patientId);
                return StatusCode(500, "An error occurred while retrieving the dashboard");
            }
        }
    }
}
