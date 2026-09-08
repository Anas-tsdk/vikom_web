using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IAvailabilityRepository
    {
        Task<IEnumerable<Availability>> GetAllAsync();
        Task<Availability?> GetByIdAsync(int id);
        Task<IEnumerable<Availability>> GetByPersonnelIdAsync(string personnelId);
        Task<IEnumerable<Availability>> GetFreeAsync();
        Task<IEnumerable<Availability>> GetUpcomingByPersonnelIdAsync(string personnelId, int count);
        Task<Availability> CreateAsync(Availability availability);
        Task<Availability> UpdateAsync(Availability availability);
        Task<bool> DeleteAsync(int id);
        Task<bool> SaveChangesAsync();
    }
}
