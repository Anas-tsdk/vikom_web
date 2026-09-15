using backend.DAL;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services
{
    /// <summary>
    /// Reconciles portal-linked patients with the hosted Supabase eligibility
    /// table. Retrying also means a newly applied Supabase migration is picked
    /// up without requiring another backend restart.
    /// </summary>
    public sealed class DailyCheckInEligibilitySyncWorker : BackgroundService
    {
        private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(1);
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<DailyCheckInEligibilitySyncWorker> _logger;

        public DailyCheckInEligibilitySyncWorker(
            IServiceScopeFactory scopeFactory,
            ILogger<DailyCheckInEligibilitySyncWorker> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                    var checkIns = scope.ServiceProvider
                        .GetRequiredService<ISupabaseDailyCheckInStore>();
                    var linkedPatientProfiles = await context.Users
                        .AsNoTracking()
                        .Where(user =>
                            user.Role == UserRoles.Patient &&
                            user.DailyCheckInEnabled &&
                            user.SupabaseProfileId != null)
                        .Select(user => user.SupabaseProfileId!)
                        .ToListAsync(stoppingToken);

                    await checkIns.SyncEligibilityAsync(linkedPatientProfiles, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception error)
                {
                    _logger.LogWarning(error, "Cloud check-in eligibility synchronization failed");
                }

                await Task.Delay(SyncInterval, stoppingToken);
            }
        }
    }
}
