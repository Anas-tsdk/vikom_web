namespace backend.DTOs
{
    /// <summary>
    /// A patient's clinical profile shown on the visit workspace and editable
    /// from the patient details page.
    /// </summary>
    public class PatientClinicalDto
    {
        public DateTime? DateOfBirth { get; set; }
        public string? NextOfKinName { get; set; }
        public string? NextOfKinRelation { get; set; }
        public string? GeneralPractitioner { get; set; }
        public string? Allergies { get; set; }
        public string? AccessInstructions { get; set; }
        public string? MedicationEquipmentNotes { get; set; }
        public List<string> Diagnoses { get; set; } = new();
        public List<MedicationDto> Medications { get; set; } = new();
        public List<string> ConditionFlags { get; set; } = new();
        public string? TreatmentPlan { get; set; }
    }

    public class MedicationDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Dosage { get; set; }
        public string? Schedule { get; set; }
    }
}
