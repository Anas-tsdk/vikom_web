using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IPatientUserLinkRepository
    {
        Task<IEnumerable<PatientUserLink>> GetAllAsync();
        Task<PatientUserLink?> GetByIdAsync(int id);
        Task<IEnumerable<PatientUserLink>> GetByPatientIdAsync(string patientId);
        Task<IEnumerable<PatientUserLink>> GetBySecondaryUserIdAsync(string secondaryUserId);
        Task<PatientUserLink> CreateAsync(PatientUserLink link);
        Task<bool> DeleteAsync(int id);
        Task<bool> SaveChangesAsync();
    }
}