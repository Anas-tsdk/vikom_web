using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using backend.DAL;
using backend.DAL.Repositories;
using backend.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

// Configure CORS - allows frontend to communicate with backend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Vite walks forward to 5174, 5175, ... when 5173 is taken, so accept any
            // loopback origin in development rather than pinning a single port.
            policy.SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback);
        }
        else
        {
            policy.WithOrigins("http://localhost:5173"); // Vite default port
        }

        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Configure SQLite Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("ApplicationDbConnection")));

// Configure Identity
builder.Services.AddIdentity<User, IdentityRole>(options =>
{
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 8;
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders();

// Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

// The TV app signs its patients in against Supabase, so device-facing endpoints
// need to accept a Supabase-issued token. That is a SECOND scheme registered
// alongside the default one below — the default is left untouched so the web
// portal's own JWTs keep working exactly as before.
var supabaseUrl = builder.Configuration["Supabase:Url"];
var supabaseJwtSecret = builder.Configuration["Supabase:JwtSecret"];
var supabaseTokenValidation = backend.Services.SupabaseAuthentication
    .BuildTokenValidationParameters(supabaseUrl, supabaseJwtSecret, out var supabaseAuthConfigured);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
})
.AddJwtBearer(backend.Services.SupabaseAuthentication.Scheme, options =>
{
    // Keep "sub" as "sub". By default the handler remaps it onto
    // ClaimTypes.NameIdentifier, which would make that claim mean "our Identity
    // GUID" on one scheme and "Supabase profile UUID" on the other — a trap for
    // anyone reading NameIdentifier without checking which scheme authenticated.
    options.MapInboundClaims = false;
    options.TokenValidationParameters = supabaseTokenValidation;
});

builder.Services.AddAuthorization();

// Register repositories
builder.Services.AddHttpClient();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IAppointmentRepository, AppointmentRepository>();
builder.Services.AddScoped<IAvailabilityRepository, AvailabilityRepository>();
builder.Services.AddScoped<IAvailabilityWindowRepository, AvailabilityWindowRepository>();
builder.Services.AddScoped<IPatientUserLinkRepository, PatientUserLinkRepository>();
builder.Services.AddScoped<ICallLogRepository, CallLogRepository>();
builder.Services.AddScoped<IVisitRepository, VisitRepository>();

// Register services
builder.Services.AddScoped<backend.Services.IAppointmentService, backend.Services.AppointmentService>();
builder.Services.AddScoped<backend.Services.IAvailabilityService, backend.Services.AvailabilityService>();
builder.Services.AddScoped<backend.Services.IPatientService, backend.Services.PatientService>();
builder.Services.AddScoped<backend.Services.IDashboardService, backend.Services.DashboardService>();
builder.Services.AddScoped<backend.Services.IPatientUserLinkService, backend.Services.PatientUserLinkService>();
builder.Services.AddScoped<backend.Services.ICallLogService, backend.Services.CallLogService>();
builder.Services.AddScoped<backend.Services.IVisitService, backend.Services.VisitService>();
builder.Services.AddScoped<backend.Services.ISupabaseProfileDirectory, backend.Services.SupabaseProfileDirectory>();

// Configure Swagger with JWT support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "HomeCare API",
        Version = "v1",
        Description = "API for HomeCare Application"
    });

    // Add JWT Authentication to Swagger
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token in the text input below.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Add logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var app = builder.Build();

if (!supabaseAuthConfigured)
{
    app.Logger.LogWarning(
        "Supabase:JwtSecret is not configured (or is shorter than 32 bytes), so " +
        "/api/tv/* will reject every request with 401. Set it with: " +
        "dotnet user-secrets set \"Supabase:JwtSecret\" \"<secret>\" --project backend");
}

// Seed database in development mode
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<ApplicationDbContext>();
    var userManager = services.GetRequiredService<UserManager<User>>();
    var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
    
    await DBInit.SeedAsync(context, userManager, roleManager);
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.MapGet("/", () => Results.Redirect("/swagger"));
}

// Skipped in development so a tablet on the LAN can reach the API over plain
// HTTP. With the redirect on, an Android client following the 307 lands on the
// self-signed ASP.NET dev certificate, which its TrustManager rejects — and the
// failure surfaces as an opaque SSLHandshakeException on the device.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Enable CORS
app.UseCors("AllowFrontend");

// Enable authentication and authorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
