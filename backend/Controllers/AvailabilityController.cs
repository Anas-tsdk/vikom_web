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
    public class AvailabilityController : ControllerBase
    {
        private readonly IAvailabilityService _availabilityService;
        private readonly ILogger<AvailabilityController> _logger;

        public AvailabilityController(
            IAvailabilityService availabilityService,
            ILogger<AvailabilityController> logger)
        {
            _availabilityService = availabilityService;
            _logger = logger;
        }

        // GET: api/availability
        [HttpGet]
        public async Task<ActionResult<IEnumerable<AvailabilityDto>>> GetAvailabilities()
        {
            try
            {
                var availabilities = await _availabilityService.GetAllAsync();
                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting availabilities");
                return StatusCode(500, "An error occurred while retrieving availabilities");
            }
        }

        // GET: api/availability/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<AvailabilityDto>> GetAvailability(int id)
        {
            try
            {
                var availability = await _availabilityService.GetByIdAsync(id);
                if (availability == null)
                    return NotFound();

                return Ok(availability);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting availability {Id}", id);
                return StatusCode(500, "An error occurred while retrieving the availability");
            }
        }

        // GET: api/availability/personnel/{personnelId}
        [HttpGet("personnel/{personnelId}")]
        public async Task<ActionResult<IEnumerable<AvailabilityDto>>> GetAvailabilitiesByPersonnel(string personnelId)
        {
            try
            {
                var availabilities = await _availabilityService.GetByPersonnelIdAsync(personnelId);
                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting availabilities for personnel {PersonnelId}", personnelId);
                return StatusCode(500, "An error occurred while retrieving availabilities");
            }
        }

        // GET: api/availability/free
        [HttpGet("free")]
        public async Task<ActionResult<IEnumerable<AvailabilityDto>>> GetFreeAvailabilities()
        {
            try
            {
                var availabilities = await _availabilityService.GetFreeAsync();
                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting free availabilities");
                return StatusCode(500, "An error occurred while retrieving free availabilities");
            }
        }

        // POST: api/availability
        [Authorize(Roles = "Personnel")]
        [HttpPost]
        public async Task<ActionResult<AvailabilityDto>> CreateAvailability([FromBody] AvailabilityDto availabilityDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                // Auto-assign personnel ID from logged-in user
                var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized();

                availabilityDto.PersonnelId = userId;

                var created = await _availabilityService.CreateAsync(availabilityDto);
                return CreatedAtAction(nameof(GetAvailability), new { id = created.Id }, created);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating availability");
                return StatusCode(500, "An error occurred while creating the availability");
            }
        }

        // PUT: api/availability/{id}
        [Authorize(Roles = "Personnel")]
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateAvailability(int id, [FromBody] AvailabilityDto availabilityDto)
        {
            try
            {
                if (id != availabilityDto.Id)
                    return BadRequest("ID mismatch");

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                await _availabilityService.UpdateAsync(id, availabilityDto);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when updating availability {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating availability {Id}", id);
                return StatusCode(500, "An error occurred while updating the availability");
            }
        }

        // DELETE: api/availability/{id}
        [Authorize(Roles = "Personnel")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAvailability(int id)
        {
            try
            {
                var result = await _availabilityService.DeleteAsync(id);
                if (!result)
                    return NotFound();

                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when deleting availability {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting availability {Id}", id);
                return StatusCode(500, "An error occurred while deleting the availability");
            }
        }

        // ============ NEW WINDOW-BASED ENDPOINTS ============

        // GET: api/availability/week/{personnelId}?startDate=2025-12-01
        [HttpGet("week/{personnelId}")]
        public async Task<ActionResult<WeekAvailabilityDto>> GetWeekAvailability(
            string personnelId,
            [FromQuery] string startDate)
        {
            try
            {
                if (!DateTime.TryParse(startDate, out var parsedDate))
                    return BadRequest("Invalid date format");

                var weekData = await _availabilityService.GetWeekAvailabilityAsync(personnelId, parsedDate);
                return Ok(weekData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting week availability for personnel {PersonnelId}: {Message}", personnelId, ex.Message);
                return StatusCode(500, new { error = "An error occurred while retrieving week availability", details = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        // GET: api/availability/day/{personnelId}?date=2025-12-04
        [HttpGet("day/{personnelId}")]
        public async Task<ActionResult<DayAvailabilityDto>> GetDayAvailability(
            string personnelId,
            [FromQuery] string date)
        {
            try
            {
                if (!DateTime.TryParse(date, out var parsedDate))
                    return BadRequest("Invalid date format");

                var dayData = await _availabilityService.GetDayAvailabilityAsync(personnelId, parsedDate);
                return Ok(dayData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting day availability for personnel {PersonnelId}: {Message}", personnelId, ex.Message);
                return StatusCode(500, new { error = "An error occurred while retrieving day availability", details = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        // POST: api/availability/window
        [Authorize(Roles = "Personnel")]
        [HttpPost("window")]
        public async Task<ActionResult<AvailabilityWindowDto>> CreateAvailabilityWindow(
            [FromBody] CreateAvailabilityWindowDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                // Auto-assign personnel ID from logged-in user
                var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized();

                var created = await _availabilityService.CreateWindowAsync(userId, dto);
                return CreatedAtAction(nameof(GetWeekAvailability), 
                    new { personnelId = userId, startDate = created.Date }, 
                    created);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating availability window");
                return StatusCode(500, "An error occurred while creating the availability window");
            }
        }

        // PUT: api/availability/window/{id}
        [Authorize(Roles = "Personnel")]
        [HttpPut("window/{id}")]
        public async Task<IActionResult> UpdateAvailabilityWindow(
            int id,
            [FromBody] UpdateAvailabilityWindowDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var updated = await _availabilityService.UpdateWindowAsync(id, dto);
                return Ok(updated);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when updating availability window {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating availability window {Id}", id);
                return StatusCode(500, "An error occurred while updating the availability window");
            }
        }

        // DELETE: api/availability/window/{id}
        [Authorize(Roles = "Personnel")]
        [HttpDelete("window/{id}")]
        public async Task<IActionResult> DeleteAvailabilityWindow(int id)
        {
            try
            {
                var result = await _availabilityService.DeleteWindowAsync(id);
                if (!result)
                    return NotFound();

                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when deleting availability window {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting availability window {Id}", id);
                return StatusCode(500, "An error occurred while deleting the availability window");
            }
        }
    }
}
