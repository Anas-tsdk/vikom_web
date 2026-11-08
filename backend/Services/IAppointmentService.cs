using backend.DTOs;

namespace backend.Services
{
    public interface IAppointmentService
    {
        Task<IEnumerable<AppointmentDto>> GetAllAsync();
        Task<AppointmentDto?> GetByIdAsync(int id);
        Task<IEnumerable<AppointmentDto>> GetByPatientIdAsync(string patientId);
        Task<IEnumerable<AppointmentDto>> GetByPersonnelIdAsync(string personnelId);
        Task<AppointmentDto> CreateAsync(AppointmentDto appointmentDto);
        Task<AppointmentDto> UpdateAsync(int id, AppointmentDto appointmentDto);
        Task MarkCompletedAsync(int id);
        Task<AppointmentDto> AcceptPatientProposalAsync(int id);
        Task<AppointmentDto?> RespondToInvitationAsync(
            int id,
            string patientId,
            string response,
            string? proposedDate = null,
            string? proposedStartTime = null,
            string? proposedEndTime = null);
        Task<bool> DeleteAsync(int id);
    }
}
