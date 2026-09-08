using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models
{
    /// <summary>
    /// A single planned task within a <see cref="Visit"/>. Seeded from the
    /// appointment's comma-separated task list when the visit starts, then
    /// tracked individually as the nurse completes or skips each one.
    /// </summary>
    public class VisitTask
    {
        public int Id { get; set; }

        [Required]
        public int VisitId { get; set; }

        [ForeignKey("VisitId")]
        public Visit Visit { get; set; } = null!;

        [Required]
        public string Title { get; set; } = string.Empty;

        public string? Category { get; set; }

        [RegularExpression(@"^(Pending|Completed|Skipped)$", ErrorMessage = "Invalid task status value.")]
        public string Status { get; set; } = "Pending";

        public string? SkippedReason { get; set; }

        public DateTime? CompletedAt { get; set; }
    }
}
