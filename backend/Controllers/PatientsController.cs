using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.Services;
using System.Security.Claims;

namespace backend.Controllers
{
    [Authorize(Policy = AuthorizationPolicies.PortalStaff)]
    [ApiController]
    [Route("api/[controller]")]
    public class PatientsController : ControllerBase
    {
        private readonly IPatientService _patientService;
        private readonly ICallLogService _callLogService;
        private readonly ISupabaseProfileDirectory _supabaseProfiles;
        private readonly IPortalAccessService _access;
        private readonly ILogger<PatientsController> _logger;

        public PatientsController(
            IPatientService patientService,
            ICallLogService callLogService,
            ISupabaseProfileDirectory supabaseProfiles,
            IPortalAccessService access,
            ILogger<PatientsController> logger)
        {
            _patientService = patientService;
            _callLogService = callLogService;
            _supabaseProfiles = supabaseProfiles;
            _access = access;
            _logger = logger;
        }

        // GET: api/patients
        [HttpGet]
        public async Task<ActionResult<IEnumerable<PatientListDto>>> GetPatients()
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized();
                }

                var patients = await _access.IsHeadNurseAsync(User)
                    ? await _patientService.GetAllPatientsAsync()
                    : await _patientService.GetLinkedPatientsAsync(userId);
                return Ok(patients);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting patients");
                return StatusCode(500, "An error occurred while retrieving patients");
            }
        }

        // GET: api/patients/all
        [HttpGet("all")]
        public async Task<ActionResult<IEnumerable<PatientListDto>>> GetAllPatients()
        {
            try
            {
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();
                var patients = await _patientService.GetAllPatientsAsync();
                return Ok(patients);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all patients");
                return StatusCode(500, "An error occurred while retrieving patients");
            }
        }

        // GET: api/patients/supabase-profiles?query=&limit=
        //
        // Backs the TV-link picker. The browser never queries Supabase for patient
        // identities: portal users hold a backend JWT, not a Supabase session, so a
        // direct lookup would run as `anon` and force `profiles` to allow anonymous
        // SELECT. The class-level PortalStaff policy gates this, and
        // the service-role key stays on the server.
        //
        // The literal segment takes precedence over the "{id}" route below, the same
        // way "all" already does.
        [HttpGet("supabase-profiles")]
        public async Task<ActionResult<IEnumerable<SupabaseProfileDto>>> SearchSupabaseProfiles(
            [FromQuery] string? query,
            [FromQuery] int? limit,
            CancellationToken cancellationToken)
        {
            if (!await _access.IsHeadNurseAsync(User)) return Forbid();
            var result = await _supabaseProfiles.SearchByUsernameAsync(query, limit, cancellationToken);
            return SupabaseProfileResult(result);
        }

        // GET: api/patients/supabase-profiles/{profileId}
        // Resolves a single profile so an existing link can be shown by name.
        [HttpGet("supabase-profiles/{profileId}")]
        public async Task<ActionResult<SupabaseProfileDto>> GetSupabaseProfile(
            string profileId,
            CancellationToken cancellationToken)
        {
            if (!await _access.IsHeadNurseAsync(User)) return Forbid();
            var result = await _supabaseProfiles.GetByIdAsync(profileId, cancellationToken);

            if (result.Status == SupabaseProfileLookupStatus.Success)
            {
                var profile = result.Profiles.FirstOrDefault();
                return profile == null ? NotFound() : Ok(profile);
            }

            return SupabaseProfileResult(result);
        }

        /// <summary>
        /// Maps a lookup outcome to a status code. A missing service-role key is a
        /// 503 rather than a 500 so the picker can tell "the server is not set up
        /// for this" apart from "the search broke", and offer manual UUID entry.
        /// </summary>
        private ActionResult SupabaseProfileResult(SupabaseProfileLookupResult result) =>
            result.Status switch
            {
                SupabaseProfileLookupStatus.Success => Ok(result.Profiles),
                SupabaseProfileLookupStatus.InvalidQuery => BadRequest(result.Message),
                SupabaseProfileLookupStatus.NotConfigured => StatusCode(
                    StatusCodes.Status503ServiceUnavailable,
                    result.Message),
                _ => StatusCode(StatusCodes.Status502BadGateway, result.Message)
            };

        private async Task<ActionResult?> ValidateSupabaseProfileAsync(
            string? profileId,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(profileId)) return null;

            var result = await _supabaseProfiles.GetByIdAsync(profileId, cancellationToken);
            if (result.Status != SupabaseProfileLookupStatus.Success)
            {
                return SupabaseProfileResult(result);
            }

            return result.Profiles.Count == 0
                ? BadRequest("The selected Supabase account could not be found.")
                : null;
        }

        // GET: api/patients/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<PatientDetailsDto>> GetPatientById(string id)
        {
            try
            {
                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();
                var isHeadNurse = await _access.IsHeadNurseAsync(User);
                var viewerPersonnelId = isHeadNurse ? null : _access.GetUserId(User);
                if (!isHeadNurse && string.IsNullOrWhiteSpace(viewerPersonnelId))
                {
                    return Unauthorized();
                }

                var patient = await _patientService.GetPatientByIdAsync(id, viewerPersonnelId);
                if (patient == null)
                {
                    return NotFound();
                }

                return Ok(patient);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting patient {PatientId}", id);
                return StatusCode(500, "An error occurred while retrieving the patient");
            }
        }

        // POST: api/patients
        [HttpPost]
        public async Task<ActionResult<PatientDetailsDto>> CreatePatient([FromBody] PatientCreateDto dto)
        {
            try
            {
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized();
                }

                var eligibilityError = await ValidateSupabaseProfileAsync(
                    dto.SupabaseProfileId,
                    HttpContext.RequestAborted);
                if (eligibilityError != null) return eligibilityError;

                var created = await _patientService.CreatePatientAsync(dto, userId);

                return CreatedAtAction(nameof(GetPatientById), new { id = created.Id }, created);
            }
            catch (InvalidOperationException ex)
            {
                // Duplicate email, Supabase profile or username: the nurse can fix
                // these, so return the message rather than a 500.
                _logger.LogWarning(ex, "Invalid operation when creating a patient");
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating patient");
                return StatusCode(500, "An error occurred while creating the patient");
            }
        }

        // PUT: api/patients/{id}
        [HttpPut("{id}")]
        public async Task<ActionResult<PatientDetailsDto>> UpdatePatient(string id, [FromBody] PatientUpdateDto dto)
        {
            try
            {
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();

                var eligibilityError = await ValidateSupabaseProfileAsync(
                    dto.SupabaseProfileId,
                    HttpContext.RequestAborted);
                if (eligibilityError != null) return eligibilityError;

                var updated = await _patientService.UpdatePatientAsync(id, dto);
                if (updated == null)
                {
                    return NotFound();
                }

                return Ok(updated);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when updating patient {PatientId}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating patient {PatientId}", id);
                return StatusCode(500, "An error occurred while updating the patient");
            }
        }

        // PUT: api/patients/{id}/notes
        [HttpPut("{id}/notes")]
        public async Task<IActionResult> UpdatePatientNotes(string id, [FromBody] PatientNotesUpdateDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();

                var updated = await _patientService.UpdatePatientNotesAsync(id, dto.Notes);
                if (!updated)
                {
                    return NotFound();
                }

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating notes for patient {PatientId}", id);
                return StatusCode(500, "An error occurred while updating the patient notes");
            }
        }

        // PUT: api/patients/{id}/treatment-plan
        [HttpPut("{id}/treatment-plan")]
        public async Task<IActionResult> UpdatePatientTreatmentPlan(
            string id,
            [FromBody] PatientTreatmentPlanUpdateDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();

                var updated = await _patientService.UpdatePatientTreatmentPlanAsync(id, dto.TreatmentPlan);
                if (!updated)
                    return NotFound();

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating daily tasks for patient {PatientId}", id);
                return StatusCode(500, "An error occurred while updating the patient's daily tasks");
            }
        }

        // POST: api/patients/{id}/calls
        [HttpPost("{id}/calls")]
        public async Task<ActionResult<CallLogDto>> LogCall(string id)
        {
            try
            {
                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();
                var personnelId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(personnelId))
                {
                    return Unauthorized();
                }

                var created = await _callLogService.CreateAsync(id, personnelId);
                if (created == null)
                {
                    return NotFound();
                }

                return Ok(created);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error logging call for patient {PatientId}", id);
                return StatusCode(500, "An error occurred while logging the call");
            }
        }

        // PUT: api/patients/{id}/calls/{callId}
        [HttpPut("{id}/calls/{callId}")]
        public async Task<IActionResult> UpdateCall(string id, int callId, [FromBody] CallLogUpdateDto dto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                if (!await _access.CanAccessPatientAsync(User, id)) return Forbid();

                var personnelId = _access.GetUserId(User);
                if (string.IsNullOrWhiteSpace(personnelId)) return Unauthorized();

                var updated = await _callLogService.UpdateStatusAsync(
                    id,
                    callId,
                    dto.Status,
                    personnelId);
                if (!updated)
                {
                    return NotFound();
                }

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating call {CallId} for patient {PatientId}", callId, id);
                return StatusCode(500, "An error occurred while updating the call");
            }
        }
    }
}
