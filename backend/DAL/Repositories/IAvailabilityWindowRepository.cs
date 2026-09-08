using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IAvailabilityWindowRepository
    {
        Task<AvailabilityWindow?> GetByIdAsync(int id);
        Task<IEnumerable<AvailabilityWindow>> GetByPersonnelIdAsync(string personnelId);
        Task<IEnumerable<AvailabilityWindow>> GetByPersonnelIdAndDateRangeAsync(string personnelId, DateTime startDate, DateTime endDate);
        Task<AvailabilityWindow?> GetByPersonnelIdAndDateAsync(string personnelId, DateTime date);
        Task<AvailabilityWindow> CreateAsync(AvailabilityWindow window);
        Task<AvailabilityWindow> UpdateAsync(AvailabilityWindow window);
        Task<bool> DeleteAsync(int id);
        Task<bool> SaveChangesAsync();
    }
}
