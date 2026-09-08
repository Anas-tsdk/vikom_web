using backend.Models;

namespace backend.DTOs
{
    /// <summary>
    /// Builds a <see cref="PatientClinicalDto"/> from a patient <see cref="User"/>
    /// and their medications. Shared by the visit and patient services so the
    /// clinical profile is mapped consistently.
    /// </summary>
    public static class PatientClinicalMapper
    {
        public static PatientClinicalDto ToDto(User patient)
        {
            return new PatientClinicalDto
            {
                DateOfBirth = patient.DateOfBirth,
                NextOfKinName = patient.NextOfKinName,
                NextOfKinRelation = patient.NextOfKinRelation,
                GeneralPractitioner = patient.GeneralPractitioner,
                Allergies = patient.Allergies,
                Diagnoses = SplitList(patient.Diagnoses),
                ConditionFlags = SplitList(patient.ConditionFlags),
                TreatmentPlan = patient.TreatmentPlan,
                Medications = (patient.Medications ?? new List<PatientMedication>())
                    .OrderBy(m => m.SortOrder)
                    .ThenBy(m => m.Id)
                    .Select(m => new MedicationDto
                    {
                        Name = m.Name,
                        Dosage = m.Dosage,
                        Schedule = m.Schedule
                    })
                    .ToList()
            };
        }

        private static List<string> SplitList(string? value)
        {
            return (value ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }
    }
}
