using backend.DTOs;

namespace backend.Services
{
    public interface IDashboardService
    {
        Task<PersonnelDashboardDto> GetPersonnelDashboardAsync(string personnelId);
        Task<PatientDashboardDto> GetPatientDashboardAsync(string patientId);
    }
}
