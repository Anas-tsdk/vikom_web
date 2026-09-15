namespace backend.DTOs
{
    public class DailyCheckInStatusDto
    {
        public bool Required { get; set; }
        public bool CheckedInToday { get; set; }
        public DateTime? LastCheckInAt { get; set; }
        public string? LastCheckInSource { get; set; }
    }

    public class DailyCheckInAlertDto
    {
        public string PatientId { get; set; } = string.Empty;
        public string PatientName { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string? Address { get; set; }
        public DateTime? LastCheckInAt { get; set; }
        public int MissedDays { get; set; }
    }
}
