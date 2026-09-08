namespace backend.DTOs
{
    public class PatientUserLinkDto
    {
        public int Id { get; set; }
        public string PatientId { get; set; } = string.Empty;
        public string PatientName { get; set; } = string.Empty;
        public string SecondaryUserId { get; set; } = string.Empty;
        public string SecondaryUserName { get; set; } = string.Empty;
        public string RelationshipType { get; set; } = string.Empty;
    }
}