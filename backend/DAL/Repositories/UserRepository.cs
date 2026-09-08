using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class UserRepository : IUserRepository
    {
        private readonly ApplicationDbContext _context;

        public UserRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _context.Users.ToListAsync();
        }

        public async Task<User?> GetByIdAsync(string id)
        {
            return await _context.Users.FindAsync(id);
        }

        public async Task<User?> GetByIdWithMedicationsAsync(string id)
        {
            return await _context.Users
                .Include(u => u.Medications)
                .FirstOrDefaultAsync(u => u.Id == id);
        }

        public async Task<User?> GetByProfileUsernameWithMedicationsAsync(string username)
        {
            return await _context.Users
                .Include(u => u.Medications)
                .FirstOrDefaultAsync(u => u.ProfileUsername == username);
        }

        /// <summary>
        /// Resolves the local user linked to a Supabase profile. Used by the TV
        /// app's endpoint, which knows only its Supabase auth UUID.
        ///
        /// Backed by the unique index IX_AspNetUsers_SupabaseProfileId, so this is
        /// a single index seek. Comparison is deliberately exact: SQLite '=' on
        /// TEXT is case-sensitive, and both Supabase UUIDs and the seeded values
        /// are lowercase. Using lower() here would defeat the index.
        /// </summary>
        public async Task<User?> GetBySupabaseProfileIdAsync(string supabaseProfileId)
        {
            return await _context.Users
                .FirstOrDefaultAsync(u => u.SupabaseProfileId == supabaseProfileId);
        }

        public async Task<IEnumerable<User>> GetByRoleAsync(string role)
        {
            return await _context.Users.Where(u => u.Role == role).ToListAsync();
        }

        public async Task<IEnumerable<User>> GetPatientsAsync()
        {
            return await _context.Users.Where(u => u.Role == "Patient").ToListAsync();
        }

        public async Task<IEnumerable<User>> GetPatientsByPersonnelAsync(string personnelId)
        {
            try
            {
                var patientIds = await _context.PatientUserLinks
                    .Where(l => l.SecondaryUserId == personnelId)
                    .Select(l => l.PatientId)
                    .Distinct()
                    .ToListAsync();

                return await _context.Users
                    .Where(u => patientIds.Contains(u.Id))
                    .ToListAsync();
            }
            catch (SqliteException)
            {
                // If the PatientUserLinks table is missing, fall back to appointment-based patient lookup.
                var appointmentPatientIds = await _context.Appointments
                    .Where(a => a.Availability.PersonnelId == personnelId)
                    .Select(a => a.PatientId)
                    .Distinct()
                    .ToListAsync();

                return await _context.Users
                    .Where(u => appointmentPatientIds.Contains(u.Id))
                    .ToListAsync();
            }
        }

        public async Task<IEnumerable<User>> GetPersonnelAsync()
        {
            return await _context.Users.Where(u => u.Role == "Personnel").ToListAsync();
        }

        public async Task<string> GetFullNameAsync(string userId)
        {
            var user = await _context.Users.FindAsync(userId);
            return user?.FullName ?? string.Empty;
        }

        public async Task<User> CreateAsync(User user)
        {
            _context.Users.Add(user);
            await SaveChangesAsync();
            return user;
        }

        public async Task<User> UpdateAsync(User user)
        {
            _context.Users.Update(user);
            await SaveChangesAsync();
            return user;
        }

        public async Task<bool> DeleteAsync(string id)
        {
            var user = await GetByIdAsync(id);
            if (user == null) return false;
            
            _context.Users.Remove(user);
            return await SaveChangesAsync();
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
