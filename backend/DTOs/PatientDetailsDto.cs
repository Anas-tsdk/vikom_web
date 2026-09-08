namespace backend.DTOs
{
    public class PatientDetailsDto
    {
        public string Id { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PhoneNumber { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string? SupabaseProfileId { get; set; }
        public string? Username { get; set; }
        public int TotalAppointments { get; set; }
        public string LastAppointmentDate { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public DateTime? NotesUpdatedAt { get; set; }
        public List<AppointmentSummaryDto> UpcomingAppointments { get; set; } = new();
        public List<AppointmentSummaryDto> PastAppointments { get; set; } = new();
        public List<CallLogDto> RecentCalls { get; set; } = new();

        // Read-only clinical profile (overview, diagnoses, medications, plan).
        public PatientClinicalDto Clinical { get; set; } = new();
    }
}
