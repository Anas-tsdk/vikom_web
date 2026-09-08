using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace backend.Services
{
    /// <summary>
    /// Token validation rules for access tokens issued by Supabase Auth (GoTrue).
    ///
    /// The TV app authenticates its patients against Supabase, not against this
    /// backend, so a device-facing endpoint has to accept a Supabase token rather
    /// than one of our own. This lives in a static helper (instead of inline in
    /// Program.cs) so the rules can be unit tested without booting the app.
    ///
    /// This project signs tokens symmetrically: its JWKS document at
    /// /auth/v1/.well-known/jwks.json is empty and its anon key is HS256, so there
    /// is no asymmetric key material. If the project is ever migrated to
    /// asymmetric signing keys, replace the parameters below with
    /// <c>options.Authority = $"{supabaseUrl}/auth/v1"</c> and let JwtBearer fetch
    /// JWKS — that removes the shared secret entirely. Keeping this in one place is
    /// what makes that a one-file change.
    /// </summary>
    public static class SupabaseAuthentication
    {
        /// <summary>Name of the authentication scheme for Supabase-issued tokens.</summary>
        public const string Scheme = "SupabaseJwt";

        /// <summary>Audience GoTrue stamps on access tokens for signed-in users.</summary>
        public const string Audience = "authenticated";

        /// <summary>
        /// HS256 needs a key of at least 256 bits. A shorter secret throws inside
        /// IdentityModel while handling the request, which would surface as a 500
        /// rather than a 401, so treat it as "not configured" instead.
        /// </summary>
        private const int MinimumSecretBytes = 32;

        public static TokenValidationParameters BuildTokenValidationParameters(
            string? supabaseUrl,
            string? jwtSecret,
            out bool configured)
        {
            var secretBytes = string.IsNullOrWhiteSpace(jwtSecret)
                ? Array.Empty<byte>()
                : Encoding.UTF8.GetBytes(jwtSecret);

            configured =
                !string.IsNullOrWhiteSpace(supabaseUrl) &&
                secretBytes.Length >= MinimumSecretBytes;

            if (!configured)
            {
                // Deliberately unusable parameters: a random key nothing was signed
                // with, and an issuer no token will ever carry. Every request then
                // fails validation and gets a 401. Registering the scheme with these
                // is safer than skipping registration, because an [Authorize]
                // attribute naming an unregistered scheme throws instead.
                return new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = "urn:supabase-not-configured",
                    ValidAudience = "urn:supabase-not-configured",
                    IssuerSigningKey = new SymmetricSecurityKey(
                        RandomNumberGenerator.GetBytes(64)),
                    ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 }
                };
            }

            return new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = BuildIssuer(supabaseUrl!),
                ValidAudience = Audience,
                IssuerSigningKey = new SymmetricSecurityKey(secretBytes),

                // Pin the algorithm so a token presenting a different "alg" header
                // cannot be coaxed through the handler.
                ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },

                ClockSkew = TimeSpan.FromMinutes(2)
            };
        }

        /// <summary>
        /// GoTrue issues tokens with an "iss" of <c>{projectUrl}/auth/v1</c>.
        /// </summary>
        public static string BuildIssuer(string supabaseUrl) =>
            $"{supabaseUrl.TrimEnd('/')}/auth/v1";
    }
}
