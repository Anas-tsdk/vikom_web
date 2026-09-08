using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class AppointmentRepository : IAppointmentRepository
    {
        private readonly ApplicationDbContext _context;

        public AppointmentRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Appointment>> GetAllAsync()
        {
            return await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .ToListAsync();
        }

        public async Task<Appointment?> GetByIdAsync(int id)
        {
            return await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .FirstOrDefaultAsync(a => a.Id == id);
        }

        public async Task<IEnumerable<Appointment>> GetByPatientIdAsync(string patientId)
        {
            return await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.PatientId == patientId)
                .ToListAsync();
        }

        public async Task<IEnumerable<Appointment>> GetByPersonnelIdAsync(string personnelId)
        {
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.Availability.PersonnelId == personnelId)
                .ToListAsync();

            return DeduplicateBySlot(appointments);
        }

        public async Task<IEnumerable<Appointment>> GetByPersonnelIdAndDateRangeAsync(string personnelId, DateTime startDate, DateTime endDate)
        {
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.Availability.PersonnelId == personnelId 
                    && a.Availability.Date >= startDate 
                    && a.Availability.Date <= endDate)
                .OrderBy(a => a.Availability.Date)
                .ToListAsync();
            
            return appointments.OrderBy(a => a.Availability.Date).ThenBy(a => a.StartTime).ToList();
        }

        public async Task<IEnumerable<Appointment>> GetUpcomingByPatientIdAsync(string patientId, int count)
        {
            var today = DateTime.Today;
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.PatientId == patientId && a.Availability.Date >= today
                    && (a.Status == "Booked" || a.Status == "InProgress"))
                .OrderBy(a => a.Availability.Date)
                .ToListAsync();
            
            return appointments
                .OrderBy(a => a.Availability.Date)
                .ThenBy(a => a.StartTime)
                .Take(count)
                .ToList();
        }

        public async Task<IEnumerable<Appointment>> GetUpcomingByPersonnelIdAsync(string personnelId, int count)
        {
            var today = DateTime.Today;
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.Availability.PersonnelId == personnelId && a.Availability.Date >= today && a.Status == "Booked")
                .OrderBy(a => a.Availability.Date)
                .ToListAsync();
            
            return DeduplicateBySlot(appointments)
                .OrderBy(a => a.Availability.Date)
                .ThenBy(a => a.StartTime)
                .Take(count)
                .ToList();
        }

        private static IEnumerable<Appointment> DeduplicateBySlot(IEnumerable<Appointment> appointments)
        {
            return appointments
                .GroupBy(appointment => new
                {
                    appointment.Availability.PersonnelId,
                    appointment.Availability.Date,
                    appointment.StartTime,
                    appointment.PatientId
                })
                .Select(group =>
                    group
                        .OrderByDescending(appointment => AppointmentStatusRank(appointment.Status))
                        .ThenByDescending(appointment => appointment.Id)
                        .First())
                .ToList();
        }

        private static int AppointmentStatusRank(string status)
        {
            return status switch
            {
                "InProgress" => 4,
                "Booked" => 3,
                "Completed" => 2,
                "Cancelled" => 1,
                _ => 0
            };
        }

        public async Task<IEnumerable<Appointment>> GetRecentByPersonnelIdAsync(string personnelId, int count)
        {
            var today = DateTime.Today;
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.Availability.PersonnelId == personnelId && a.Availability.Date < today)
                .OrderByDescending(a => a.Availability.Date)
                .ToListAsync();
            
            return appointments
                .OrderByDescending(a => a.Availability.Date)
                .ThenByDescending(a => a.StartTime)
                .Take(count)
                .ToList();
        }

        public async Task<IEnumerable<Appointment>> GetHistoryByPatientIdAsync(string patientId)
        {
            var today = DateTime.Today;
            var appointments = await _context.Appointments
                .Include(a => a.Patient)
                .Include(a => a.Visit)
                .Include(a => a.Availability)
                .ThenInclude(av => av.Personnel)
                .Where(a => a.PatientId == patientId && a.Availability.Date < today)
                .OrderByDescending(a => a.Availability.Date)
                .ToListAsync();
            
            return appointments
                .OrderByDescending(a => a.Availability.Date)
                .ThenByDescending(a => a.StartTime)
                .ToList();
        }

        public async Task<int> GetDistinctPatientCountAsync(string personnelId)
        {
            return await _context.Appointments
                .Where(a => a.Availability.PersonnelId == personnelId)
                .Select(a => a.PatientId)
                .Distinct()
                .CountAsync();
        }

        public async Task<int> GetThisWeekCountAsync(string personnelId)
        {
            var today = DateTime.Today;
            var startOfWeek = today.AddDays(-(int)today.DayOfWeek);
            var endOfWeek = startOfWeek.AddDays(7);

            return await _context.Appointments
                .Where(a => a.Availability.PersonnelId == personnelId && 
                           a.Availability.Date >= startOfWeek && 
                           a.Availability.Date < endOfWeek)
                .CountAsync();
        }

        public async Task<int> GetPendingCountAsync(string personnelId)
        {
            return await _context.Appointments
                .Where(a => a.Availability.PersonnelId == personnelId && a.Status == "Booked")
                .CountAsync();
        }

        public async Task<int> GetCancelledCountAsync(string personnelId)
        {
            return await _context.Appointments
                .Where(a => a.Availability.PersonnelId == personnelId && a.Status == "Cancelled")
                .CountAsync();
        }

        public async Task<int> GetTotalByPatientIdAsync(string patientId)
        {
            return await _context.Appointments
                .Where(a => a.PatientId == patientId)
                .CountAsync();
        }

        public async Task<int> GetCompletedByPatientIdAsync(string patientId)
        {
            return await _context.Appointments
                .Where(a => a.PatientId == patientId && a.Status == "Completed")
                .CountAsync();
        }

        public async Task<Appointment> CreateAsync(Appointment appointment)
        {
            _context.Appointments.Add(appointment);
            await SaveChangesAsync();
            return appointment;
        }

        public async Task<Appointment> UpdateAsync(Appointment appointment)
        {
            _context.Appointments.Update(appointment);
            await SaveChangesAsync();
            return appointment;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var appointment = await _context.Appointments.FindAsync(id);
            if (appointment == null) return false;
            
            _context.Appointments.Remove(appointment);
            return await SaveChangesAsync();
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
