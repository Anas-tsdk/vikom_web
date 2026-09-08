using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IUserRepository
    {
        Task<IEnumerable<User>> GetAllAsync();
        Task<User?> GetByIdAsync(string id);
        Task<User?> GetByIdWithMedicationsAsync(string id);
        Task<User?> GetByProfileUsernameWithMedicationsAsync(string username);
        Task<User?> GetBySupabaseProfileIdAsync(string supabaseProfileId);
        Task<IEnumerable<User>> GetByRoleAsync(string role);
        Task<IEnumerable<User>> GetPatientsAsync();
        Task<IEnumerable<User>> GetPatientsByPersonnelAsync(string personnelId);
        Task<IEnumerable<User>> GetPersonnelAsync();
        Task<string> GetFullNameAsync(string userId);
        Task<User> CreateAsync(User user);
        Task<User> UpdateAsync(User user);
        Task<bool> DeleteAsync(string id);
        Task<bool> SaveChangesAsync();
    }
}
