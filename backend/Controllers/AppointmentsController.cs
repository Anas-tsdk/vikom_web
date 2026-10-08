using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.Services;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Policy = AuthorizationPolicies.PortalStaff)]
    [ApiController]
    [Route("api/[controller]")]
    public class AppointmentsController : ControllerBase
    {
        private readonly IAppointmentService _appointmentService;
        private readonly IAvailabilityService _availabilityService;
        private readonly IPortalAccessService _access;
        private readonly ILogger<AppointmentsController> _logger;

        public AppointmentsController(
            IAppointmentService appointmentService,
            IAvailabilityService availabilityService,
            IPortalAccessService access,
            ILogger<AppointmentsController> logger)
        {
            _appointmentService = appointmentService;
            _availabilityService = availabilityService;
            _access = access;
            _logger = logger;
        }

        // GET: api/appointments
        [HttpGet]
        public async Task<ActionResult<IEnumerable<AppointmentDto>>> GetAppointments()
        {
            try
            {
                var appointments = await _access.IsHeadNurseAsync(User)
                    ? await _appointmentService.GetAllAsync()
                    : await _appointmentService.GetByPersonnelIdAsync(_access.GetUserId(User)!);
                return Ok(appointments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting appointments");
                return StatusCode(500, "An error occurred while retrieving appointments");
            }
        }

        // GET: api/appointments/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<AppointmentDto>> GetAppointment(int id)
        {
            try
            {
                var appointment = await _appointmentService.GetByIdAsync(id);
                if (appointment == null)
                    return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, appointment.PersonnelId ?? string.Empty))
                    return Forbid();

                return Ok(appointment);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting appointment {Id}", id);
                return StatusCode(500, "An error occurred while retrieving the appointment");
            }
        }

        // GET: api/appointments/patient/{patientId}
        [HttpGet("patient/{patientId}")]
        public async Task<ActionResult<IEnumerable<AppointmentDto>>> GetAppointmentsByPatient(string patientId)
        {
            try
            {
                if (!await _access.CanAccessPatientAsync(User, patientId)) return Forbid();

                var appointments = await _appointmentService.GetByPatientIdAsync(patientId);
                if (!await _access.IsHeadNurseAsync(User))
                {
                    var callerId = _access.GetUserId(User);
                    appointments = appointments.Where(appointment =>
                        appointment.PersonnelId == callerId);
                }
                return Ok(appointments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting appointments for patient {PatientId}", patientId);
                return StatusCode(500, "An error occurred while retrieving appointments");
            }
        }

        // GET: api/appointments/personnel/{personnelId}
        [HttpGet("personnel/{personnelId}")]
        public async Task<ActionResult<IEnumerable<AppointmentDto>>> GetAppointmentsByPersonnel(string personnelId)
        {
            try
            {
                if (!await _access.CanManagePersonnelAsync(User, personnelId)) return Forbid();

                var appointments = await _appointmentService.GetByPersonnelIdAsync(personnelId);
                return Ok(appointments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting appointments for personnel {PersonnelId}", personnelId);
                return StatusCode(500, "An error occurred while retrieving appointments");
            }
        }

        // POST: api/appointments
        [HttpPost]
        public async Task<ActionResult<AppointmentDto>> CreateAppointment([FromBody] AppointmentDto appointmentDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();

                var availability = await _availabilityService.GetByIdAsync(appointmentDto.AvailabilityId);
                if (availability == null) return BadRequest("Availability not found");
                if (!await _access.CanManagePersonnelAsync(User, availability.PersonnelId)) return Forbid();
                if (!await _access.CanAccessPatientAsync(User, appointmentDto.PatientId)) return Forbid();

                var created = await _appointmentService.CreateAsync(appointmentDto);
                return CreatedAtAction(nameof(GetAppointment), new { id = created.Id }, created);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when creating appointment");
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating appointment");
                return StatusCode(500, "An error occurred while creating the appointment");
            }
        }

        // PUT: api/appointments/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateAppointment(int id, [FromBody] AppointmentDto appointmentDto)
        {
            try
            {
                if (id != appointmentDto.Id)
                    return BadRequest("ID mismatch");

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();

                var existing = await _appointmentService.GetByIdAsync(id);
                if (existing == null)
                    return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId ?? string.Empty))
                    return Forbid();

                if (appointmentDto.AvailabilityId != 0 &&
                    appointmentDto.AvailabilityId != existing.AvailabilityId)
                {
                    var newAvailability = await _availabilityService.GetByIdAsync(appointmentDto.AvailabilityId);
                    if (newAvailability == null) return BadRequest("Availability not found");
                    if (!await _access.CanManagePersonnelAsync(User, newAvailability.PersonnelId))
                        return Forbid();
                }

                await _appointmentService.UpdateAsync(id, appointmentDto);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when updating appointment {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating appointment {Id}", id);
                return StatusCode(500, "An error occurred while updating the appointment");
            }
        }

        // POST: api/appointments/{id}/accept-proposal
        [HttpPost("{id}/accept-proposal")]
        public async Task<ActionResult<AppointmentDto>> AcceptPatientProposal(int id)
        {
            try
            {
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();

                var existing = await _appointmentService.GetByIdAsync(id);
                if (existing == null)
                    return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId ?? string.Empty))
                    return Forbid();

                var accepted = await _appointmentService.AcceptPatientProposalAsync(id);
                return Ok(accepted);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when accepting patient proposal for appointment {Id}", id);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error accepting patient proposal for appointment {Id}", id);
                return StatusCode(500, "An error occurred while accepting the proposed time");
            }
        }

        // DELETE: api/appointments/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAppointment(int id)
        {
            try
            {
                if (!await _access.IsHeadNurseAsync(User)) return Forbid();
                var existing = await _appointmentService.GetByIdAsync(id);
                if (existing == null)
                    return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, existing.PersonnelId ?? string.Empty))
                    return Forbid();

                var result = await _appointmentService.DeleteAsync(id);
                if (!result)
                    return NotFound();

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting appointment {Id}", id);
                return StatusCode(500, "An error occurred while deleting the appointment");
            }
        }
    }
}
