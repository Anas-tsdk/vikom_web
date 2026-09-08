namespace backend.DTOs
{
    public class AvailabilitySummaryDto
    {
        public int Id { get; set; }
        public DateTime Date { get; set; }
        public string StartTime { get; set; } = string.Empty;
        public string EndTime { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public bool IsBooked { get; set; }
    }
}
