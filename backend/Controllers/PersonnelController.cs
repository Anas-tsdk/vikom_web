using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.DAL.Repositories;
using backend.Services;
using backend.Models;
using Microsoft.AspNetCore.Identity;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Policy = AuthorizationPolicies.PortalStaff)]
    [ApiController]
    [Route("api/[controller]")]
    public class PersonnelController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly IPortalAccessService _access;
        private readonly UserManager<User> _userManager;
        private readonly ILogger<PersonnelController> _logger;

        public PersonnelController(
            IUserRepository userRepository,
            IPortalAccessService access,
            UserManager<User> userManager,
            ILogger<PersonnelController> logger)
        {
            _userRepository = userRepository;
            _access = access;
            _userManager = userManager;
            _logger = logger;
        }

        // POST: api/personnel
        // Only a current head nurse may create another privileged account.
        // Public self-registration remains available at /api/auth/register and
        // always creates a normal Nurse regardless of extra JSON properties.
        [HttpPost]
        public async Task<ActionResult<UserDto>> CreatePersonnel(
            [FromBody] PersonnelRegistrationDto request)
        {
            if (!await _access.IsHeadNurseAsync(User)) return Forbid();
            if (!ModelState.IsValid) return BadRequest(ModelState);

            if (request.Role != UserRoles.Nurse && request.Role != UserRoles.HeadNurse)
                return BadRequest("Role must be Nurse or HeadNurse");

            var personnel = new User
            {
                UserName = request.UserName.Trim(),
                Email = request.Email.Trim(),
                FullName = request.FullName.Trim(),
                Role = request.Role,
                PhoneNumber = request.PhoneNumber?.Trim(),
                Address = request.Address?.Trim()
            };

            var createResult = await _userManager.CreateAsync(personnel, request.Password);
            if (!createResult.Succeeded) return BadRequest(createResult.Errors);

            var roleResult = await _userManager.AddToRoleAsync(personnel, request.Role);
            if (!roleResult.Succeeded)
            {
                await _userManager.DeleteAsync(personnel);
                return BadRequest(roleResult.Errors);
            }

            return CreatedAtAction(
                nameof(GetPersonnelById),
                new { id = personnel.Id },
                ToDto(personnel));
        }

        // GET: api/personnel
        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetPersonnel()
        {
            try
            {
                var personnel = await _userRepository.GetPersonnelAsync();
                if (!await _access.IsHeadNurseAsync(User))
                {
                    var callerId = _access.GetUserId(User);
                    personnel = personnel.Where(member => member.Id == callerId);
                }

                var personnelDtos = personnel.Select(ToDto);
                
                return Ok(personnelDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel");
                return StatusCode(500, "An error occurred while retrieving personnel");
            }
        }

        [HttpGet("schedule-options")]
        public async Task<ActionResult<IEnumerable<PersonnelScheduleOptionDto>>> GetScheduleOptions()
        {
            try
            {
                var personnel = await _userRepository.GetPersonnelAsync();
                return Ok(personnel.Select(member => new PersonnelScheduleOptionDto
                {
                    Id = member.Id,
                    FullName = member.FullName
                }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel schedule options");
                return StatusCode(500, "An error occurred while retrieving personnel schedule options");
            }
        }

        [HttpGet("call-options")]
        public async Task<ActionResult<IEnumerable<PersonnelCallOptionDto>>> GetCallOptions()
        {
            try
            {
                var personnel = await _userRepository.GetPersonnelAsync();
                return Ok(personnel.Select(member => new PersonnelCallOptionDto
                {
                    Id = member.Id,
                    FullName = member.FullName,
                    Role = member.Role
                }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel call options");
                return StatusCode(500, "An error occurred while retrieving personnel call options");
            }
        }

        // GET: api/personnel/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<UserDto>> GetPersonnelById(string id)
        {
            if (!await _access.CanManagePersonnelAsync(User, id)) return Forbid();

            var personnel = await _userRepository.GetByIdAsync(id);
            if (personnel == null || !backend.Models.UserRoles.IsPortalStaff(personnel.Role))
                return NotFound();

            return Ok(ToDto(personnel));
        }

        private static UserDto ToDto(User personnel) => new()
        {
            Id = personnel.Id,
            UserName = personnel.UserName ?? string.Empty,
            Email = personnel.Email ?? string.Empty,
            FullName = personnel.FullName,
            Role = personnel.Role,
            PhoneNumber = personnel.PhoneNumber,
            Address = personnel.Address,
            SupabaseProfileId = personnel.SupabaseProfileId
        };
    }
}
