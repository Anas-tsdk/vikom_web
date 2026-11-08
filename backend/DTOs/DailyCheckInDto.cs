namespace backend.DTOs
{
    public class DailyCheckInStatusDto
    {
        public bool Required { get; set; }
        public bool CheckedInToday { get; set; }
        public DateTime? LastCheckInAt { get; set; }
        public string? LastCheckInSource { get; set; }
    }
}
