namespace backend.DTOs
{
    public class VisitTaskDto
    {
        public int Id { get; set; }
        public int VisitId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Category { get; set; }
        public string Status { get; set; } = "Pending";
        public string? SkippedReason { get; set; }
        public DateTime? CompletedAt { get; set; }
    }
}
