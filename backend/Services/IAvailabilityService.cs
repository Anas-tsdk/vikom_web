using backend.DTOs;

namespace backend.Services
{
    public interface IAvailabilityService
    {
        // Legacy slot methods (keep for backward compatibility)
        Task<IEnumerable<AvailabilityDto>> GetAllAsync();
        Task<AvailabilityDto?> GetByIdAsync(int id);
        Task<IEnumerable<AvailabilityDto>> GetByPersonnelIdAsync(string personnelId);
        Task<IEnumerable<AvailabilityDto>> GetFreeAsync();
        Task<AvailabilityDto> CreateAsync(AvailabilityDto availabilityDto);
        Task<AvailabilityDto> UpdateAsync(int id, AvailabilityDto availabilityDto);
        Task<bool> DeleteAsync(int id);

        // New window-based methods
        Task<WeekAvailabilityDto> GetWeekAvailabilityAsync(string personnelId, DateTime startDate);
        Task<DayAvailabilityDto> GetDayAvailabilityAsync(string personnelId, DateTime date);
        Task<AvailabilityWindowDto?> GetWindowByIdAsync(int id);
        Task<AvailabilityWindowDto> CreateWindowAsync(string personnelId, CreateAvailabilityWindowDto dto);
        Task<AvailabilityWindowDto> UpdateWindowAsync(string personnelId, int id, UpdateAvailabilityWindowDto dto);
        Task<bool> DeleteWindowAsync(string personnelId, int id);
        Task<IReadOnlyList<WeeklyAvailabilityRuleDto>> GetWeeklyScheduleAsync(string personnelId);
        Task<IReadOnlyList<WeeklyAvailabilityRuleDto>> UpdateWeeklyScheduleAsync(
            string personnelId,
            IReadOnlyList<WeeklyAvailabilityRuleDto> rules);
    }
}
