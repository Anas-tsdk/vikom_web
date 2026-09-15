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
    public class VisitsController : ControllerBase
    {
        private readonly IVisitService _visitService;
        private readonly IAppointmentService _appointmentService;
        private readonly IPortalAccessService _access;
        private readonly ILogger<VisitsController> _logger;

        public VisitsController(
            IVisitService visitService,
            IAppointmentService appointmentService,
            IPortalAccessService access,
            ILogger<VisitsController> logger)
        {
            _visitService = visitService;
            _appointmentService = appointmentService;
            _access = access;
            _logger = logger;
        }

        // POST: api/visits/start
        [HttpPost("start")]
        public async Task<ActionResult<VisitDto>> StartVisit([FromBody] StartVisitRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var nurseId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(nurseId))
                    return Unauthorized();

                var appointment = await _appointmentService.GetByIdAsync(request.AppointmentId);
                if (appointment == null) return NotFound();
                // Viewing/planning can be head-nurse-wide, but clinical execution
                // is never an implicit takeover. Only the assigned nurse starts it.
                if (!IsCaller(appointment.PersonnelId)) return Forbid();

                var existingVisit = await _visitService.GetByAppointmentIdAsync(request.AppointmentId);
                if (existingVisit != null && !IsCaller(existingVisit.ResponsibleUserId)) return Forbid();

                var visit = await _visitService.StartOrGetForAppointmentAsync(request.AppointmentId, nurseId, request.VisitType);
                return Ok(visit);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation when starting visit for appointment {AppointmentId}", request.AppointmentId);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting visit for appointment {AppointmentId}", request.AppointmentId);
                return StatusCode(500, "An error occurred while starting the visit");
            }
        }

        // GET: api/visits/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<VisitDto>> GetVisit(int id)
        {
            try
            {
                var visit = await _visitService.GetByIdAsync(id);
                if (visit == null) return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, visit.ResponsibleUserId)) return Forbid();
                return Ok(visit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting visit {Id}", id);
                return StatusCode(500, "An error occurred while retrieving the visit");
            }
        }

        // GET: api/visits/by-appointment/{appointmentId}
        [HttpGet("by-appointment/{appointmentId}")]
        public async Task<ActionResult<VisitDto>> GetVisitByAppointment(int appointmentId)
        {
            try
            {
                var appointment = await _appointmentService.GetByIdAsync(appointmentId);
                if (appointment == null) return NotFound();
                if (!await _access.CanManagePersonnelAsync(User, appointment.PersonnelId ?? string.Empty))
                    return Forbid();

                var visit = await _visitService.GetByAppointmentIdAsync(appointmentId);
                if (visit == null) return NotFound();
                return Ok(visit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting visit for appointment {AppointmentId}", appointmentId);
                return StatusCode(500, "An error occurred while retrieving the visit");
            }
        }

        // GET: api/visits/by-patient/{patientId}
        [HttpGet("by-patient/{patientId}")]
        public async Task<ActionResult<IEnumerable<VisitSummaryDto>>> GetVisitsByPatient(string patientId)
        {
            try
            {
                if (!await _access.CanAccessPatientAsync(User, patientId)) return Forbid();
                var visits = await _visitService.GetByPatientIdAsync(patientId);
                if (!await _access.IsHeadNurseAsync(User))
                {
                    var nurseId = _access.GetUserId(User);
                    visits = visits.Where(visit => visit.ResponsibleUserId == nurseId);
                }
                return Ok(visits);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting visits for patient {PatientId}", patientId);
                return StatusCode(500, "An error occurred while retrieving visits");
            }
        }

        // GET: api/visits/mine
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<VisitSummaryDto>>> GetMyVisits()
        {
            try
            {
                var nurseId = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(nurseId))
                    return Unauthorized();

                var visits = await _visitService.GetByResponsibleUserIdAsync(nurseId);
                return Ok(visits);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting visits for nurse");
                return StatusCode(500, "An error occurred while retrieving visits");
            }
        }

        // PUT: api/visits/{id}/notes
        [HttpPut("{id}/notes")]
        public async Task<ActionResult<VisitDto>> UpdateNotes(int id, [FromBody] UpdateVisitNotesRequest request)
        {
            try
            {
                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var visit = await _visitService.UpdateNotesAsync(id, request.Notes);
                if (visit == null) return NotFound();
                return Ok(visit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating notes for visit {Id}", id);
                return StatusCode(500, "An error occurred while updating the visit notes");
            }
        }

        // POST: api/visits/{id}/tasks
        [HttpPost("{id}/tasks")]
        public async Task<ActionResult<VisitTaskDto>> AddTask(int id, [FromBody] AddVisitTaskRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var task = await _visitService.AddTaskAsync(id, request.Title);
                if (task == null) return NotFound();
                return Ok(task);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding task to visit {Id}", id);
                return StatusCode(500, "An error occurred while adding the task");
            }
        }

        // PUT: api/visits/{id}/tasks/{taskId}
        [HttpPut("{id}/tasks/{taskId}")]
        public async Task<ActionResult<VisitTaskDto>> UpdateTask(int id, int taskId, [FromBody] UpdateVisitTaskRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var task = await _visitService.UpdateTaskAsync(id, taskId, request.Status, request.SkippedReason);
                if (task == null) return NotFound();
                return Ok(task);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating task {TaskId} for visit {Id}", taskId, id);
                return StatusCode(500, "An error occurred while updating the task");
            }
        }

        // POST: api/visits/{id}/complete
        [HttpPost("{id}/complete")]
        public async Task<ActionResult<VisitDto>> CompleteVisit(int id, [FromBody] CompleteVisitRequest request)
        {
            try
            {
                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var visit = await _visitService.CompleteAsync(id, request.Notes, request.FollowUpRequired);
                if (visit == null) return NotFound();
                return Ok(visit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error completing visit {Id}", id);
                return StatusCode(500, "An error occurred while completing the visit");
            }
        }

        // POST: api/visits/{id}/cancel
        [HttpPost("{id}/cancel")]
        public async Task<ActionResult<VisitDto>> CancelVisit(int id, [FromBody] CancelVisitRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var visit = await _visitService.CancelAsync(id, request.Reason, request.Notes);
                if (visit == null) return NotFound();
                return Ok(visit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling visit {Id}", id);
                return StatusCode(500, "An error occurred while cancelling the visit");
            }
        }

        // POST: api/visits/{id}/call-attempts
        [HttpPost("{id}/call-attempts")]
        public async Task<ActionResult<CallLogDto>> LogCallAttempt(int id, [FromBody] LogCallAttemptRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _visitService.GetByIdAsync(id);
                if (existing == null) return NotFound();
                if (!IsCaller(existing.ResponsibleUserId)) return Forbid();

                var attempt = await _visitService.LogCallAttemptAsync(id, request);
                if (attempt == null) return NotFound();
                return Ok(attempt);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error logging call attempt for visit {Id}", id);
                return StatusCode(500, "An error occurred while logging the call attempt");
            }
        }

        private bool IsCaller(string? assignedUserId)
        {
            var callerId = _access.GetUserId(User);
            return !string.IsNullOrWhiteSpace(callerId) &&
                   string.Equals(callerId, assignedUserId, StringComparison.Ordinal);
        }
    }
}
