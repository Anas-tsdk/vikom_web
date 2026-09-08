using backend.DAL.Repositories;
using backend.DTOs;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    /// <summary>
    /// Who the signed-in TV patient is, and who looks after them.
    ///
    /// Separate from <see cref="TvAppointmentsController"/> so the tablet can render
    /// its header before — or without — an appointments fetch: a patient with no
    /// appointments still has a name.
    /// </summary>
    [Route("api/tv")]
    public class TvPatientController : TvControllerBase
    {
        private readonly IPatientUserLinkService _patientUserLinkService;
        private readonly IUserRepository _userRepository;
        private readonly ILogger<TvPatientController> _logger;

        public TvPatientController(
            IPatientUserLinkService patientUserLinkService,
            IUserRepository userRepository,
            ILogger<TvPatientController> logger)
            : base(userRepository, logger)
        {
            _patientUserLinkService = patientUserLinkService;
            _userRepository = userRepository;
            _logger = logger;
        }

        // GET: api/tv/me
        [HttpGet("me")]
        public async Task<ActionResult<TvProfileDto>> GetMe()
        {
            try
            {
                var (user, error) = await ResolveCallerAsync();
                if (error != null) return error;

                return Ok(new TvProfileDto
                {
                    FullName = user!.FullName,
                    UserName = user.UserName ?? string.Empty
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting the signed-in TV user");
                return StatusCode(500, "An error occurred while retrieving your profile");
            }
        }

        // GET: api/tv/careteam/mine
        [HttpGet("careteam/mine")]
        public async Task<ActionResult<IEnumerable<TvCareTeamMemberDto>>> GetMyCareTeam()
        {
            try
            {
                var (user, error) = await ResolveCallerAsync();
                if (error != null) return error;

                var links = await _patientUserLinkService.GetByPatientIdAsync(user!.Id);

                // The link DTO carries the name but not the phone number, so each
                // member is looked up once. A care team is a handful of people, so
                // this stays cheap; if it ever grows, widen the link DTO instead.
                var members = new List<TvCareTeamMemberDto>();

                foreach (var link in links)
                {
                    var member = await _userRepository.GetByIdAsync(link.SecondaryUserId);

                    members.Add(new TvCareTeamMemberDto
                    {
                        FullName = member?.FullName ?? link.SecondaryUserName,
                        RelationshipType = link.RelationshipType,
                        PhoneNumber = member?.PhoneNumber
                    });
                }

                return Ok(members);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting the care team for the signed-in TV user");
                return StatusCode(500, "An error occurred while retrieving your care team");
            }
        }
    }
}
