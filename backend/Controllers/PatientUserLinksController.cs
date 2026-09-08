using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.Services;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Roles = "Personnel")]
    [ApiController]
    [Route("api/[controller]")]
    public class PatientUserLinksController : ControllerBase
    {
        private readonly IPatientUserLinkService _service;
        private readonly ILogger<PatientUserLinksController> _logger;

        public PatientUserLinksController(
            IPatientUserLinkService service,
            ILogger<PatientUserLinksController> logger)
        {
            _service = service;
            _logger = logger;
        }

        // GET: api/patientuserlinks
        [HttpGet]
        [Authorize(Roles = "Personnel")]
        public async Task<ActionResult<IEnumerable<PatientUserLinkDto>>> GetAll()
        {
            try
            {
                var links = await _service.GetAllAsync();
                return Ok(links);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting patient user links");
                return StatusCode(500, "An error occurred while retrieving links");
            }
        }

        // GET: api/patientuserlinks/patient/{patientId}
        [HttpGet("patient/{patientId}")]
        public async Task<ActionResult<IEnumerable<PatientUserLinkDto>>> GetByPatientId(string patientId)
        {
            try
            {
                var links = await _service.GetByPatientIdAsync(patientId);
                return Ok(links);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting links for patient {PatientId}", patientId);
                return StatusCode(500, "An error occurred while retrieving links");
            }
        }

        // GET: api/patientuserlinks/secondary/{secondaryUserId}
        [HttpGet("secondary/{secondaryUserId}")]
        public async Task<ActionResult<IEnumerable<PatientUserLinkDto>>> GetBySecondaryUserId(string secondaryUserId)
        {
            try
            {
                var links = await _service.GetBySecondaryUserIdAsync(secondaryUserId);
                return Ok(links);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting links for secondary user {SecondaryUserId}", secondaryUserId);
                return StatusCode(500, "An error occurred while retrieving links");
            }
        }

        // POST: api/patientuserlinks
        [HttpPost]
        [Authorize(Roles = "Personnel")]
        public async Task<ActionResult<PatientUserLinkDto>> Create([FromBody] CreatePatientUserLinkRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var link = await _service.CreateAsync(request.PatientId, request.SecondaryUserId, request.RelationshipType);
                return CreatedAtAction(nameof(GetById), new { id = link.Id }, link);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating patient user link");
                return StatusCode(500, "An error occurred while creating the link");
            }
        }

        // GET: api/patientuserlinks/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<PatientUserLinkDto>> GetById(int id)
        {
            try
            {
                var link = await _service.GetByIdAsync(id);
                if (link == null)
                {
                    return NotFound();
                }
                return Ok(link);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting link {Id}", id);
                return StatusCode(500, "An error occurred while retrieving the link");
            }
        }

        // DELETE: api/patientuserlinks/{id}
        [HttpDelete("{id}")]
        [Authorize(Roles = "Personnel")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var result = await _service.DeleteAsync(id);
                if (!result)
                {
                    return NotFound();
                }
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting link {Id}", id);
                return StatusCode(500, "An error occurred while deleting the link");
            }
        }
    }

    public class CreatePatientUserLinkRequest
    {
        public string PatientId { get; set; } = string.Empty;
        public string SecondaryUserId { get; set; } = string.Empty;
        public string RelationshipType { get; set; } = "Personnel";
    }
}