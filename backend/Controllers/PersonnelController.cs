using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using backend.DTOs;
using backend.DAL.Repositories;

namespace backend.Controllers
{
    // The portal is personnel-only; patients reach their data through the TV app's
    // Supabase-authenticated endpoints instead.
    [Authorize(Roles = "Personnel")]
    [ApiController]
    [Route("api/[controller]")]
    public class PersonnelController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly ILogger<PersonnelController> _logger;

        public PersonnelController(
            IUserRepository userRepository,
            ILogger<PersonnelController> logger)
        {
            _userRepository = userRepository;
            _logger = logger;
        }

        // GET: api/personnel
        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetPersonnel()
        {
            try
            {
                var personnel = await _userRepository.GetPersonnelAsync();
                var personnelDtos = personnel.Select(p => new UserDto
                {
                    Id = p.Id,
                    UserName = p.UserName ?? string.Empty,
                    Email = p.Email ?? string.Empty,
                    FullName = p.FullName,
                    Role = p.Role,
                    PhoneNumber = p.PhoneNumber,
                    Address = p.Address
                });
                
                return Ok(personnelDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting personnel");
                return StatusCode(500, "An error occurred while retrieving personnel");
            }
        }
    }
}
