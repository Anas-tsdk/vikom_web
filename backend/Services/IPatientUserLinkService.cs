using backend.DTOs;
using backend.Models;

namespace backend.Services
{
    public interface IPatientUserLinkService
    {
        Task<IEnumerable<PatientUserLinkDto>> GetAllAsync();
        Task<PatientUserLinkDto?> GetByIdAsync(int id);
        Task<IEnumerable<PatientUserLinkDto>> GetByPatientIdAsync(string patientId);
        Task<IEnumerable<PatientUserLinkDto>> GetBySecondaryUserIdAsync(string secondaryUserId);
        Task<PatientUserLinkDto> CreateAsync(string patientId, string secondaryUserId, string relationshipType);
        Task<bool> DeleteAsync(int id);
    }
}