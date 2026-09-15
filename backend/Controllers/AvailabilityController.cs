using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.Services;
using System.Security.Claims;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Policy = AuthorizationPolicies.PortalStaff)]
    [ApiController]
    [Route("api/[controller]")]
    public class AvailabilityController : ControllerBase
    {
        private readonly IAvailabilityService _availabilityService;
        private readonly IPortalAccessService _access;
        private readonly ILogger<AvailabilityController> _logger;

        public AvailabilityController(
            IAvailabilityService availabilityService,
            IPortalAccessService access,
            ILogger<AvailabilityController> logger)
        {
            _availabilityService = availabilityService;
            _access = access;
            _logger = logger;
        }

        // GET: api/availability
        [HttpGet]
        public async Task<ActionResult<IEnumerable<AvailabilityDto>>> GetAvailabilities()
        {
            try
            {
                var availabilities = await _access.IsHeadNurseAsync(User)
                    ? await _availabilityService.GetAllAsync()
                    : await _availabilityService.GetByPersonnelIdAsync(_access.GetUserId(User)!);
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
                if (!await _access.IsPortalStaffAsync(availability.PersonnelId))
                    return BadRequest("The availability owner is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, availability.PersonnelId))
                    return Forbid();

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
                if (!await _access.IsPortalStaffAsync(personnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, personnelId)) return Forbid();

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
                if (!await _access.IsHeadNurseAsync(User))
                {
                    var callerId = _access.GetUserId(User);
                    availabilities = availabilities.Where(availability =>
                        availability.PersonnelId == callerId);
                }
                return Ok(availabilities);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting free availabilities");
                return StatusCode(500, "An error occurred while retrieving free availabilities");
            }
        }

        // POST: api/availability
        [HttpPost]
        public async Task<ActionResult<AvailabilityDto>> CreateAvailability([FromBody] AvailabilityDto availabilityDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var userId = _access.GetUserId(User);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized();

                var targetPersonnelId = string.IsNullOrWhiteSpace(availabilityDto.PersonnelId)
                    ? userId
                    : availabilityDto.PersonnelId;
                if (!await _access.IsPortalStaffAsync(targetPersonnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, targetPersonnelId)) return Forbid();

                availabilityDto.PersonnelId = targetPersonnelId;

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
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateAvailability(int id, [FromBody] AvailabilityDto availabilityDto)
        {
            try
            {
                if (id != availabilityDto.Id)
                    return BadRequest("ID mismatch");

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _availabilityService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!await _access.IsPortalStaffAsync(existing.PersonnelId))
                    return BadRequest("The availability owner is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId)) return Forbid();

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
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAvailability(int id)
        {
            try
            {
                var existing = await _availabilityService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!await _access.IsPortalStaffAsync(existing.PersonnelId))
                    return BadRequest("The availability owner is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId)) return Forbid();

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
                if (!await _access.IsPortalStaffAsync(personnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, personnelId)) return Forbid();

                var weekData = await _availabilityService.GetWeekAvailabilityAsync(personnelId, parsedDate);
                return Ok(weekData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting week availability for personnel {PersonnelId}: {Message}", personnelId, ex.Message);
                return StatusCode(500, "An error occurred while retrieving week availability");
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
                if (!await _access.IsPortalStaffAsync(personnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, personnelId)) return Forbid();

                var dayData = await _availabilityService.GetDayAvailabilityAsync(personnelId, parsedDate);
                return Ok(dayData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting day availability for personnel {PersonnelId}: {Message}", personnelId, ex.Message);
                return StatusCode(500, "An error occurred while retrieving day availability");
            }
        }

        // POST: api/availability/window
        [HttpPost("window")]
        public async Task<ActionResult<AvailabilityWindowDto>> CreateAvailabilityWindow(
            [FromBody] CreateAvailabilityWindowDto dto,
            [FromQuery] string? personnelId = null)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var userId = _access.GetUserId(User);
                if (string.IsNullOrEmpty(userId))
                    return Unauthorized();

                var targetPersonnelId = string.IsNullOrWhiteSpace(personnelId) ? userId : personnelId;
                if (!await _access.IsPortalStaffAsync(targetPersonnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, targetPersonnelId)) return Forbid();

                var created = await _availabilityService.CreateWindowAsync(targetPersonnelId, dto);
                return CreatedAtAction(nameof(GetWeekAvailability), 
                    new { personnelId = targetPersonnelId, startDate = created.Date }, 
                    created);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid availability window");
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating availability window");
                return StatusCode(500, "An error occurred while creating the availability window");
            }
        }

        // PUT: api/availability/window/{id}
        [HttpPut("window/{id}")]
        public async Task<IActionResult> UpdateAvailabilityWindow(
            int id,
            [FromBody] UpdateAvailabilityWindowDto dto,
            [FromQuery] string? personnelId = null)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var userId = _access.GetUserId(User);
                if (string.IsNullOrEmpty(userId)) return Unauthorized();
                var existing = await _availabilityService.GetWindowByIdAsync(id);
                if (existing == null) return NotFound();
                if (!await _access.IsPortalStaffAsync(existing.PersonnelId))
                    return BadRequest("The availability owner is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId)) return Forbid();
                if (!string.IsNullOrWhiteSpace(personnelId) && personnelId != existing.PersonnelId)
                    return BadRequest("The selected nurse does not own this availability window");

                var updated = await _availabilityService.UpdateWindowAsync(existing.PersonnelId, id, dto);
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
        [HttpDelete("window/{id}")]
        public async Task<IActionResult> DeleteAvailabilityWindow(
            int id,
            [FromQuery] string? personnelId = null)
        {
            try
            {
                var userId = _access.GetUserId(User);
                if (string.IsNullOrEmpty(userId)) return Unauthorized();
                var existing = await _availabilityService.GetWindowByIdAsync(id);
                if (existing == null) return NotFound();
                if (!await _access.IsPortalStaffAsync(existing.PersonnelId))
                    return BadRequest("The availability owner is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId)) return Forbid();
                if (!string.IsNullOrWhiteSpace(personnelId) && personnelId != existing.PersonnelId)
                    return BadRequest("The selected nurse does not own this availability window");

                var result = await _availabilityService.DeleteWindowAsync(existing.PersonnelId, id);
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

        [HttpGet("weekly-schedule")]
        public async Task<ActionResult<IReadOnlyList<WeeklyAvailabilityRuleDto>>> GetWeeklySchedule(
            [FromQuery] string? personnelId = null)
        {
            var userId = _access.GetUserId(User);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            var targetPersonnelId = string.IsNullOrWhiteSpace(personnelId) ? userId : personnelId;
            if (!await _access.IsPortalStaffAsync(targetPersonnelId))
                return BadRequest("The selected user is not a nurse");
            if (!await _access.CanManagePersonnelAsync(User, targetPersonnelId)) return Forbid();
            return Ok(await _availabilityService.GetWeeklyScheduleAsync(targetPersonnelId));
        }

        [HttpPut("weekly-schedule")]
        public async Task<ActionResult<IReadOnlyList<WeeklyAvailabilityRuleDto>>> UpdateWeeklySchedule(
            [FromBody] List<WeeklyAvailabilityRuleDto> rules,
            [FromQuery] string? personnelId = null)
        {
            try
            {
                var userId = _access.GetUserId(User);
                if (string.IsNullOrEmpty(userId)) return Unauthorized();
                var targetPersonnelId = string.IsNullOrWhiteSpace(personnelId) ? userId : personnelId;
                if (!await _access.IsPortalStaffAsync(targetPersonnelId))
                    return BadRequest("The selected user is not a nurse");
                if (!await _access.CanManagePersonnelAsync(User, targetPersonnelId)) return Forbid();
                return Ok(await _availabilityService.UpdateWeeklyScheduleAsync(targetPersonnelId, rules));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
        }
    }
}
