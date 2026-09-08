using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class AvailabilityWindowRepository : IAvailabilityWindowRepository
    {
        private readonly ApplicationDbContext _context;

        public AvailabilityWindowRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<AvailabilityWindow?> GetByIdAsync(int id)
        {
            return await _context.AvailabilityWindows
                .Include(w => w.Personnel)
                .Include(w => w.Slots)
                    .ThenInclude(s => s.Appointment)
                .FirstOrDefaultAsync(w => w.Id == id);
        }

        public async Task<IEnumerable<AvailabilityWindow>> GetByPersonnelIdAsync(string personnelId)
        {
            var windows = await _context.AvailabilityWindows
                .Include(w => w.Personnel)
                .Include(w => w.Slots)
                    .ThenInclude(s => s.Appointment)
                .Where(w => w.PersonnelId == personnelId)
                .OrderBy(w => w.Date)
                .ToListAsync();
            
            return windows.OrderBy(w => w.Date).ThenBy(w => w.StartTime).ToList();
        }

        public async Task<IEnumerable<AvailabilityWindow>> GetByPersonnelIdAndDateRangeAsync(
            string personnelId, DateTime startDate, DateTime endDate)
        {
            var windows = await _context.AvailabilityWindows
                .Include(w => w.Personnel)
                .Include(w => w.Slots)
                    .ThenInclude(s => s.Appointment)
                .Where(w => w.PersonnelId == personnelId && w.Date >= startDate && w.Date <= endDate)
                .OrderBy(w => w.Date)
                .ToListAsync();
            
            return windows.OrderBy(w => w.Date).ThenBy(w => w.StartTime).ToList();
        }

        public async Task<AvailabilityWindow?> GetByPersonnelIdAndDateAsync(string personnelId, DateTime date)
        {
            return await _context.AvailabilityWindows
                .Include(w => w.Personnel)
                .Include(w => w.Slots)
                    .ThenInclude(s => s.Appointment)
                .FirstOrDefaultAsync(w => w.PersonnelId == personnelId && w.Date == date);
        }

        public async Task<AvailabilityWindow> CreateAsync(AvailabilityWindow window)
        {
            _context.AvailabilityWindows.Add(window);
            await SaveChangesAsync();
            return window;
        }

        public async Task<AvailabilityWindow> UpdateAsync(AvailabilityWindow window)
        {
            _context.AvailabilityWindows.Update(window);
            await SaveChangesAsync();
            return window;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var window = await GetByIdAsync(id);
            if (window == null)
                return false;

            _context.AvailabilityWindows.Remove(window);
            return await SaveChangesAsync();
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
