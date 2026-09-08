namespace backend.DTOs
{
    public class DayAvailabilityDto
    {
        public string Date { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty; // "Free", "Available", "Unavailable"
        public List<AvailabilityWindowDto> Windows { get; set; } = new();
        public List<AppointmentSummaryDto> Appointments { get; set; } = new();
    }

    public class WeekAvailabilityDto
    {
        public string StartDate { get; set; } = string.Empty; // Monday
        public string EndDate { get; set; } = string.Empty;   // Sunday
        public List<DayAvailabilityDto> Days { get; set; } = new();
    }
}
