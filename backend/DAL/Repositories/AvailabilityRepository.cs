using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class AvailabilityRepository : IAvailabilityRepository
    {
        private readonly ApplicationDbContext _context;

        public AvailabilityRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Availability>> GetAllAsync()
        {
            return await _context.Availabilities
                .Include(a => a.Personnel)
                .Include(a => a.Appointment)
                .ToListAsync();
        }

        public async Task<Availability?> GetByIdAsync(int id)
        {
            return await _context.Availabilities
                .Include(a => a.Personnel)
                .Include(a => a.Appointment)
                .FirstOrDefaultAsync(a => a.Id == id);
        }

        public async Task<IEnumerable<Availability>> GetByPersonnelIdAsync(string personnelId)
        {
            return await _context.Availabilities
                .Include(a => a.Personnel)
                .Include(a => a.Appointment)
                .Where(a => a.PersonnelId == personnelId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Availability>> GetFreeAsync()
        {
            var availabilities = await _context.Availabilities
                .Include(a => a.Personnel)
                .Include(a => a.Appointment)
                .Where(a => a.Appointment == null)
                .OrderBy(a => a.Date)
                .ToListAsync();
            
            return availabilities
                .OrderBy(a => a.Date)
                .ThenBy(a => a.StartTime)
                .ToList();
        }

        public async Task<IEnumerable<Availability>> GetUpcomingByPersonnelIdAsync(string personnelId, int count)
        {
            var today = DateTime.Today;
            var availabilities = await _context.Availabilities
                .Include(a => a.Personnel)
                .Include(a => a.Appointment)
                .Where(a => a.PersonnelId == personnelId && a.Date >= today)
                .OrderBy(a => a.Date)
                .ToListAsync();
            
            return availabilities
                .OrderBy(a => a.Date)
                .ThenBy(a => a.StartTime)
                .Take(count)
                .ToList();
        }

        public async Task<Availability> CreateAsync(Availability availability)
        {
            _context.Availabilities.Add(availability);
            await SaveChangesAsync();
            return availability;
        }

        public async Task<Availability> UpdateAsync(Availability availability)
        {
            _context.Availabilities.Update(availability);
            await SaveChangesAsync();
            return availability;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var availability = await _context.Availabilities.FindAsync(id);
            if (availability == null) return false;
            
            _context.Availabilities.Remove(availability);
            return await SaveChangesAsync();
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
