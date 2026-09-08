using backend.Models;

namespace backend.DAL.Repositories
{
    public interface IVisitRepository
    {
        Task<Visit?> GetByIdAsync(int id);
        Task<Visit?> GetByAppointmentIdAsync(int appointmentId);
        Task<IEnumerable<Visit>> GetByPatientIdAsync(string patientId);
        Task<IEnumerable<Visit>> GetByResponsibleUserIdAsync(string nurseId);
        Task<Visit> CreateAsync(Visit visit);
        Task<Visit> UpdateAsync(Visit visit);
        Task<VisitTask?> GetTaskByIdAsync(int taskId);
        Task<VisitTask> CreateTaskAsync(VisitTask task);
        Task<VisitTask> UpdateTaskAsync(VisitTask task);
        Task<bool> SaveChangesAsync();
    }
}
