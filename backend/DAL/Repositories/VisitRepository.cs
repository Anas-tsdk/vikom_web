using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class VisitRepository : IVisitRepository
    {
        private readonly ApplicationDbContext _context;

        public VisitRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Visit?> GetByIdAsync(int id)
        {
            return await _context.Visits
                .Include(v => v.Patient)
                    .ThenInclude(p => p.Medications)
                .Include(v => v.ResponsibleUser)
                .Include(v => v.Tasks)
                .Include(v => v.Appointment)
                    .ThenInclude(a => a.Availability)
                        .ThenInclude(av => av.Personnel)
                .FirstOrDefaultAsync(v => v.Id == id);
        }

        public async Task<Visit?> GetByAppointmentIdAsync(int appointmentId)
        {
            return await _context.Visits
                .Include(v => v.Patient)
                    .ThenInclude(p => p.Medications)
                .Include(v => v.ResponsibleUser)
                .Include(v => v.Tasks)
                .Include(v => v.Appointment)
                    .ThenInclude(a => a.Availability)
                        .ThenInclude(av => av.Personnel)
                .FirstOrDefaultAsync(v => v.AppointmentId == appointmentId);
        }

        public async Task<IEnumerable<Visit>> GetByPatientIdAsync(string patientId)
        {
            return await _context.Visits
                .Include(v => v.Patient)
                .Include(v => v.Tasks)
                .Include(v => v.Appointment)
                    .ThenInclude(a => a.Availability)
                .Where(v => v.PatientId == patientId)
                .OrderByDescending(v => v.StartedAt)
                .ToListAsync();
        }

        public async Task<IEnumerable<Visit>> GetByResponsibleUserIdAsync(string nurseId)
        {
            return await _context.Visits
                .Include(v => v.Patient)
                .Include(v => v.Tasks)
                .Include(v => v.Appointment)
                    .ThenInclude(a => a.Availability)
                .Where(v => v.ResponsibleUserId == nurseId)
                .OrderByDescending(v => v.StartedAt)
                .ToListAsync();
        }

        public async Task<Visit> CreateAsync(Visit visit)
        {
            _context.Visits.Add(visit);
            await SaveChangesAsync();
            return visit;
        }

        public async Task<Visit> UpdateAsync(Visit visit)
        {
            _context.Visits.Update(visit);
            await SaveChangesAsync();
            return visit;
        }

        public async Task<VisitTask?> GetTaskByIdAsync(int taskId)
        {
            return await _context.VisitTasks.FirstOrDefaultAsync(t => t.Id == taskId);
        }

        public async Task<VisitTask> CreateTaskAsync(VisitTask task)
        {
            _context.VisitTasks.Add(task);
            await SaveChangesAsync();
            return task;
        }

        public async Task<VisitTask> UpdateTaskAsync(VisitTask task)
        {
            _context.VisitTasks.Update(task);
            await SaveChangesAsync();
            return task;
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
