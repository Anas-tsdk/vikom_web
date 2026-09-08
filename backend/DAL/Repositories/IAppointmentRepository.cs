using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IAppointmentRepository
    {
        Task<IEnumerable<Appointment>> GetAllAsync();
        Task<Appointment?> GetByIdAsync(int id);
        Task<IEnumerable<Appointment>> GetByPatientIdAsync(string patientId);
        Task<IEnumerable<Appointment>> GetByPersonnelIdAsync(string personnelId);
        Task<IEnumerable<Appointment>> GetByPersonnelIdAndDateRangeAsync(string personnelId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Appointment>> GetUpcomingByPatientIdAsync(string patientId, int count);
        Task<IEnumerable<Appointment>> GetUpcomingByPersonnelIdAsync(string personnelId, int count);
        Task<IEnumerable<Appointment>> GetRecentByPersonnelIdAsync(string personnelId, int count);
        Task<IEnumerable<Appointment>> GetHistoryByPatientIdAsync(string patientId);
        Task<int> GetDistinctPatientCountAsync(string personnelId);
        Task<int> GetThisWeekCountAsync(string personnelId);
        Task<int> GetPendingCountAsync(string personnelId);
        Task<int> GetCancelledCountAsync(string personnelId);
        Task<int> GetTotalByPatientIdAsync(string patientId);
        Task<int> GetCompletedByPatientIdAsync(string patientId);
        Task<Appointment> CreateAsync(Appointment appointment);
        Task<Appointment> UpdateAsync(Appointment appointment);
        Task<bool> DeleteAsync(int id);
        Task<bool> SaveChangesAsync();
    }
}
