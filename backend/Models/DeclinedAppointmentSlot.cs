namespace backend.Models
{
    /// <summary>
    /// Permanent record of a time range a patient declined. Appointments are
    /// moved when they are replanned, so this separate history prevents an old
    /// declined time from becoming selectable again later.
    /// </summary>
    public class DeclinedAppointmentSlot
    {
        public int Id { get; set; }
        public required string PatientId { get; set; }
        public DateTime Date { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public DateTime RecordedAt { get; set; }
        public User Patient { get; set; } = null!;
    }
}
