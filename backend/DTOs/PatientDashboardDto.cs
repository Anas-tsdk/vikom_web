namespace backend.DTOs
{
    public class PatientDashboardDto
    {
        public string PatientId { get; set; } = string.Empty;
        public string PatientName { get; set; } = string.Empty;
        public int TotalAppointments { get; set; }
        public int CompletedAppointments { get; set; }
        public List<AppointmentSummaryDto> UpcomingAppointments { get; set; } = new();
        public List<AppointmentSummaryDto> AppointmentHistory { get; set; } = new();
        public List<CaregiverSummaryDto> AvailableCaregivers { get; set; } = new();
    }
}
