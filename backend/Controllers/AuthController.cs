using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using backend.Models;
using backend.DTOs;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly UserManager<User> _userManager;
        private readonly SignInManager<User> _signInManager;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            UserManager<User> userManager,
            SignInManager<User> signInManager,
            IConfiguration configuration,
            ILogger<AuthController> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _configuration = configuration;
            _logger = logger;
        }

        // POST: api/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto registerDto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var user = new User
            {
                UserName = registerDto.UserName,
                Email = registerDto.Email,
                FullName = registerDto.FullName,
                // Public registration can never grant planning/admin privileges.
                // A HeadNurse must be provisioned by an existing trusted process.
                Role = UserRoles.Nurse,
                PhoneNumber = registerDto.PhoneNumber,
                Address = registerDto.Address
            };

            var result = await _userManager.CreateAsync(user, registerDto.Password);

            if (!result.Succeeded)
            {
                return BadRequest(result.Errors);
            }

            var roleResult = await _userManager.AddToRoleAsync(user, UserRoles.Nurse);
            if (!roleResult.Succeeded)
            {
                // Do not leave an account that has a model role but no matching
                // Identity role: it would sign in yet fail every policy check.
                await _userManager.DeleteAsync(user);
                return BadRequest(roleResult.Errors);
            }

            _logger.LogInformation($"User {registerDto.UserName} registered successfully");

            return Ok(new { message = "User registered successfully" });
        }

        // POST: api/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto loginDto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var user = await _userManager.FindByNameAsync(loginDto.UserName);
            
            if (user == null)
            {
                return Unauthorized(new { message = "Invalid username or password" });
            }

            var result = await _signInManager.CheckPasswordSignInAsync(user, loginDto.Password, false);

            if (!result.Succeeded)
            {
                return Unauthorized(new { message = "Invalid username or password" });
            }

            // The credentials are valid, but only personnel may use the portal. Patients
            // sign in through Supabase on the TV app instead.
            if (!UserRoles.IsPortalStaff(user.Role))
            {
                _logger.LogWarning("Blocked portal login for non-personnel user {UserName}", loginDto.UserName);
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Portalen er kun for helsepersonell." });
            }

            // Generate JWT token
            var token = await GenerateJwtToken(user);

            _logger.LogInformation($"User {loginDto.UserName} logged in successfully");

            return Ok(new 
            { 
                token = token,
                userName = user.UserName,
                fullName = user.FullName,
                role = user.Role,
                userId = user.Id
            });
        }

        // POST: api/auth/refresh
        // Re-issues the session from the current database record. This is
        // important when an administrator changes a staff role while an older
        // (but still valid) JWT is stored in the browser. The legacy Personnel
        // role remains accepted by the portal policy during this transition,
        // but the returned token and user information use Nurse/HeadNurse.
        [Authorize(Policy = AuthorizationPolicies.PortalStaff)]
        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshSession()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null || !UserRoles.IsPortalStaff(user.Role))
                return Unauthorized();

            var token = await GenerateJwtToken(user);
            return Ok(new
            {
                token,
                userName = user.UserName,
                fullName = user.FullName,
                role = user.Role,
                userId = user.Id
            });
        }

        // POST: api/auth/logout
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Ok(new { message = "Logged out successfully" });
        }

        // Helper method to generate JWT token
        private async Task<string> GenerateJwtToken(User user)
        {
            var jwtSettings = _configuration.GetSection("Jwt");
            var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Name, user.UserName!),
                new Claim(ClaimTypes.Email, user.Email!),
                new Claim("FullName", user.FullName),
                new Claim("Role", user.Role)
            };

            // Add roles from UserManager
            var roles = await _userManager.GetRolesAsync(user);
            foreach (var role in roles)
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddHours(24),
                Issuer = jwtSettings["Issuer"],
                Audience = jwtSettings["Audience"],
                SigningCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(key),
                    SecurityAlgorithms.HmacSha256Signature)
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }
    }
}
