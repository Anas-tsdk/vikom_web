using backend.Models;

namespace backend.DAL.Repositories
{
    public interface ICallLogRepository
    {
        Task<CallLog?> GetByIdAsync(int id);
        Task<IEnumerable<CallLog>> GetByPatientIdAsync(string patientId, int count);
        Task<IEnumerable<CallLog>> GetByVisitIdAsync(int visitId);
        Task<CallLog> CreateAsync(CallLog callLog);
        Task<CallLog> UpdateAsync(CallLog callLog);
        Task<bool> SaveChangesAsync();
    }
}
