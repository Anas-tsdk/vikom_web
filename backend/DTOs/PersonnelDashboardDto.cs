namespace backend.DTOs
{
    public class PersonnelDashboardDto
    {
        public string PersonnelId { get; set; } = string.Empty;
        public string PersonnelName { get; set; } = string.Empty;
        public int TotalPatients { get; set; }
        public int AppointmentsThisWeek { get; set; }
        public int PendingAppointments { get; set; }
        public int CancelledAppointments { get; set; }
        public List<AppointmentSummaryDto> UpcomingAppointments { get; set; } = new();
        public List<AppointmentSummaryDto> RecentAppointments { get; set; } = new();
        public List<AvailabilitySummaryDto> UpcomingAvailability { get; set; } = new();
    }
}
