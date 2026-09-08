using backend.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class PatientUserLinkRepository : IPatientUserLinkRepository
    {
        private readonly ApplicationDbContext _context;

        public PatientUserLinkRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<PatientUserLink>> GetAllAsync()
        {
            try
            {
                return await _context.PatientUserLinks
                    .Include(l => l.Patient)
                    .Include(l => l.SecondaryUser)
                    .ToListAsync();
            }
            catch (SqliteException)
            {
                return new List<PatientUserLink>();
            }
        }

        public async Task<PatientUserLink?> GetByIdAsync(int id)
        {
            try
            {
                return await _context.PatientUserLinks
                    .Include(l => l.Patient)
                    .Include(l => l.SecondaryUser)
                    .FirstOrDefaultAsync(l => l.Id == id);
            }
            catch (SqliteException)
            {
                return null;
            }
        }

        public async Task<IEnumerable<PatientUserLink>> GetByPatientIdAsync(string patientId)
        {
            try
            {
                return await _context.PatientUserLinks
                    .Include(l => l.Patient)
                    .Include(l => l.SecondaryUser)
                    .Where(l => l.PatientId == patientId)
                    .ToListAsync();
            }
            catch (SqliteException)
            {
                return new List<PatientUserLink>();
            }
        }

        public async Task<IEnumerable<PatientUserLink>> GetBySecondaryUserIdAsync(string secondaryUserId)
        {
            try
            {
                return await _context.PatientUserLinks
                    .Include(l => l.Patient)
                    .Include(l => l.SecondaryUser)
                    .Where(l => l.SecondaryUserId == secondaryUserId)
                    .ToListAsync();
            }
            catch (SqliteException)
            {
                return new List<PatientUserLink>();
            }
        }

        public async Task<PatientUserLink> CreateAsync(PatientUserLink link)
        {
            _context.PatientUserLinks.Add(link);
            await _context.SaveChangesAsync();
            return link;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var link = await _context.PatientUserLinks.FindAsync(id);
            if (link == null) return false;

            _context.PatientUserLinks.Remove(link);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}