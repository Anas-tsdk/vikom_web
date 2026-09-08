namespace backend.DTOs
{
    public class CaregiverSummaryDto
    {
        public string PersonnelId { get; set; } = string.Empty;
        public string PersonnelName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string NextAvailableDate { get; set; } = string.Empty;
    }
}
