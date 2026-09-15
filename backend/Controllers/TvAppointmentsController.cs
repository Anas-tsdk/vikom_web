using backend.DAL.Repositories;
using backend.DTOs;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    /// <summary>
    /// Device-facing appointment endpoints for the Android TV app.
    ///
    /// Deliberately a separate controller rather than extra actions on
    /// <see cref="AppointmentsController"/>: that class carries a class-level
    /// [Authorize] for the portal's own scheme, and combining it with an
    /// action-level scheme override works only through subtle metadata-merging
    /// rules that a later refactor could silently change. Keeping the TV surface in
    /// its own file also means it can be rate-limited or locked down on its own.
    ///
    /// Caller resolution and the Supabase scheme come from
    /// <see cref="TvControllerBase"/>.
    /// </summary>
    [Route("api/tv/appointments")]
    public class TvAppointmentsController : TvControllerBase
    {
        private readonly IAppointmentService _appointmentService;
        private readonly ILogger<TvAppointmentsController> _logger;

        public TvAppointmentsController(
            IAppointmentService appointmentService,
            IUserRepository userRepository,
            ILogger<TvAppointmentsController> logger)
            : base(userRepository, logger)
        {
            _appointmentService = appointmentService;
            _logger = logger;
        }

        // GET: api/tv/appointments/mine
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<AppointmentDto>>> GetMine()
        {
            try
            {
                var (user, error) = await ResolveCallerAsync();
                if (error != null) return error;

                var appointments = await _appointmentService.GetByPatientIdAsync(user!.Id);

                return Ok(appointments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting appointments for the signed-in TV user");
                return StatusCode(500, "An error occurred while retrieving appointments");
            }
        }

        // POST: api/tv/appointments/{id}/response
        // The Supabase token identifies the patient; the service also verifies
        // that the appointment belongs to that patient before changing anything.
        [HttpPost("{id}/response")]
        public async Task<ActionResult<AppointmentDto>> Respond(
            int id,
            [FromBody] AppointmentResponseRequest request)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            try
            {
                var (user, error) = await ResolveCallerAsync();
                if (error != null) return error;

                var appointment = await _appointmentService.RespondToInvitationAsync(
                    id,
                    user!.Id,
                    request.Response,
                    request.ProposedDate,
                    request.ProposedStartTime,
                    request.ProposedEndTime);
                return appointment == null ? NotFound() : Ok(appointment);
            }
            catch (InvalidOperationException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Patient could not answer appointment invitation {AppointmentId}",
                    id);
                return Conflict(exception.Message);
            }
            catch (Exception exception)
            {
                _logger.LogError(
                    exception,
                    "Error answering appointment invitation {AppointmentId}",
                    id);
                return StatusCode(500, "An error occurred while answering the appointment invitation");
            }
        }
    }
}
