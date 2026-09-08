using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.DAL.Repositories
{
    public class CallLogRepository : ICallLogRepository
    {
        private readonly ApplicationDbContext _context;

        public CallLogRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<CallLog?> GetByIdAsync(int id)
        {
            return await _context.CallLogs
                .Include(c => c.Personnel)
                .FirstOrDefaultAsync(c => c.Id == id);
        }

        public async Task<IEnumerable<CallLog>> GetByPatientIdAsync(string patientId, int count)
        {
            return await _context.CallLogs
                .Include(c => c.Personnel)
                .Where(c => c.PatientId == patientId)
                .OrderByDescending(c => c.StartedAt)
                .Take(count)
                .ToListAsync();
        }

        public async Task<IEnumerable<CallLog>> GetByVisitIdAsync(int visitId)
        {
            return await _context.CallLogs
                .Include(c => c.Personnel)
                .Where(c => c.VisitId == visitId)
                .OrderBy(c => c.StartedAt)
                .ToListAsync();
        }

        public async Task<CallLog> CreateAsync(CallLog callLog)
        {
            _context.CallLogs.Add(callLog);
            await SaveChangesAsync();
            return callLog;
        }

        public async Task<CallLog> UpdateAsync(CallLog callLog)
        {
            _context.CallLogs.Update(callLog);
            await SaveChangesAsync();
            return callLog;
        }

        public async Task<bool> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync() > 0;
        }
    }
}
