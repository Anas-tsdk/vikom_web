using backend.DTOs;
using backend.DAL.Repositories;
using backend.Models;

namespace backend.Services
{
    public class CallLogService : ICallLogService
    {
        private readonly ICallLogRepository _callLogRepository;
        private readonly IUserRepository _userRepository;

        public CallLogService(ICallLogRepository callLogRepository, IUserRepository userRepository)
        {
            _callLogRepository = callLogRepository;
            _userRepository = userRepository;
        }

        public async Task<CallLogDto?> CreateAsync(string patientId, string personnelId)
        {
            // Only log calls placed to an actual patient; reject unknown ids or
            // non-patient users so the call history stays meaningful.
            var patient = await _userRepository.GetByIdAsync(patientId);
            if (patient == null || !string.Equals(patient.Role, "Patient", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var callLog = new CallLog
            {
                PatientId = patientId,
                PersonnelId = personnelId,
                StartedAt = DateTime.UtcNow,
                Status = "Initiated"
            };

            var created = await _callLogRepository.CreateAsync(callLog);
            var result = await _callLogRepository.GetByIdAsync(created.Id);
            return MapToDto(result!);
        }

        public async Task<bool> UpdateStatusAsync(
            string patientId,
            int callId,
            string status,
            string personnelId)
        {
            var existing = await _callLogRepository.GetByIdAsync(callId);
            // Scope the update to both route patient and caller. A nurse who can
            // access the same patient must not be able to rewrite somebody
            // else's call result by guessing a log id.
            if (existing == null ||
                existing.PatientId != patientId ||
                existing.PersonnelId != personnelId)
            {
                return false;
            }

            existing.Status = status;
            await _callLogRepository.UpdateAsync(existing);
            return true;
        }

        public async Task<IEnumerable<CallLogDto>> GetRecentByPatientAsync(
            string patientId,
            int count,
            string? personnelId = null)
        {
            var calls = await _callLogRepository.GetByPatientIdAsync(patientId, count, personnelId);
            return calls.Select(MapToDto).ToList();
        }

        private static CallLogDto MapToDto(CallLog callLog)
        {
            return new CallLogDto
            {
                Id = callLog.Id,
                PatientId = callLog.PatientId,
                PersonnelId = callLog.PersonnelId,
                PersonnelName = callLog.Personnel?.FullName ?? string.Empty,
                StartedAt = callLog.StartedAt,
                Status = callLog.Status
            };
        }
    }
}
