using backend.DTOs;

namespace backend.Services
{
    public interface ICallLogService
    {
        Task<CallLogDto?> CreateAsync(string patientId, string personnelId);
        Task<bool> UpdateStatusAsync(string patientId, int callId, string status);
        Task<IEnumerable<CallLogDto>> GetRecentByPatientAsync(string patientId, int count);
    }
}
