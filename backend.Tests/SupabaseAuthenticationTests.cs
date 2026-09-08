using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using backend.Services;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Tests the Supabase token validation rules. These mint their own tokens with
/// locally generated secrets, so they pass anywhere — no real Supabase project or
/// user-secret required.
/// </summary>
public class SupabaseAuthenticationTests
{
    private const string Url = "https://project.supabase.co";
    private const string Secret = "a-test-signing-secret-long-enough-for-hs256";

    private static string CreateToken(
        string secret,
        string? issuer = null,
        string audience = SupabaseAuthentication.Audience,
        string subject = "c9f53a55-1375-48e6-95ce-25917f55be2d",
        DateTime? expires = null)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            SecurityAlgorithms.HmacSha256);

        var expiresAt = expires ?? DateTime.UtcNow.AddHours(1);

        var token = new JwtSecurityToken(
            issuer: issuer ?? SupabaseAuthentication.BuildIssuer(Url),
            audience: audience,
            claims: new[] { new Claim("sub", subject) },
            // Derived from expiry rather than from "now" so an already-expired
            // token still has nbf < exp; JwtSecurityToken rejects the reverse at
            // construction time with an ArgumentException.
            notBefore: expiresAt.AddHours(-1),
            expires: expiresAt,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static ClaimsPrincipal Validate(string token, TokenValidationParameters parameters)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        return handler.ValidateToken(token, parameters, out _);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("too-short")]
    public void NotConsideredConfigured_WhenSecretIsMissingOrTooShort(string? secret)
    {
        SupabaseAuthentication.BuildTokenValidationParameters(Url, secret, out var configured);

        Assert.False(configured);
    }

    [Fact]
    public void NotConsideredConfigured_WhenUrlIsMissing()
    {
        SupabaseAuthentication.BuildTokenValidationParameters(null, Secret, out var configured);

        Assert.False(configured);
    }

    [Fact]
    public void ConsideredConfigured_WhenBothPresent()
    {
        SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out var configured);

        Assert.True(configured);
    }

    [Fact]
    public void IssuerIsBuiltFromTheProjectUrl_TrailingSlashTolerated()
    {
        Assert.Equal(
            "https://project.supabase.co/auth/v1",
            SupabaseAuthentication.BuildIssuer("https://project.supabase.co/"));

        Assert.Equal(
            "https://project.supabase.co/auth/v1",
            SupabaseAuthentication.BuildIssuer("https://project.supabase.co"));
    }

    [Fact]
    public void ValidToken_IsAcceptedAndExposesSubClaim()
    {
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out _);

        var principal = Validate(CreateToken(Secret), parameters);

        Assert.Equal(
            "c9f53a55-1375-48e6-95ce-25917f55be2d",
            principal.FindFirstValue("sub"));
    }

    [Fact]
    public void TokenSignedWithAnotherSecret_IsRejected()
    {
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out _);
        var token = CreateToken("a-completely-different-secret-of-good-length");

        Assert.ThrowsAny<SecurityTokenException>(() => Validate(token, parameters));
    }

    [Fact]
    public void TokenWithWrongAudience_IsRejected()
    {
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out _);
        var token = CreateToken(Secret, audience: "anon");

        Assert.ThrowsAny<SecurityTokenException>(() => Validate(token, parameters));
    }

    [Fact]
    public void TokenFromAnotherProject_IsRejected()
    {
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out _);
        var token = CreateToken(Secret, issuer: "https://someone-else.supabase.co/auth/v1");

        Assert.ThrowsAny<SecurityTokenException>(() => Validate(token, parameters));
    }

    [Fact]
    public void ExpiredToken_IsRejected()
    {
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, Secret, out _);

        // Beyond the 2 minute clock skew allowance.
        var token = CreateToken(Secret, expires: DateTime.UtcNow.AddMinutes(-10));

        Assert.ThrowsAny<SecurityTokenException>(() => Validate(token, parameters));
    }

    [Fact]
    public void WhenNotConfigured_AnOtherwiseValidTokenIsStillRejected()
    {
        // The degrade-safely guarantee: a missing secret must produce 401s rather
        // than either a startup crash or an accidentally open endpoint.
        var parameters = SupabaseAuthentication.BuildTokenValidationParameters(Url, null, out var configured);

        Assert.False(configured);
        Assert.ThrowsAny<SecurityTokenException>(() => Validate(CreateToken(Secret), parameters));
    }
}
