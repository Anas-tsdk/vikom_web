namespace backend.Models
{
    /// <summary>
    /// Canonical application roles. <see cref="LegacyPersonnel"/> is retained
    /// only so users and JWTs created by older versions can still sign in while
    /// their database records are migrated to Nurse or HeadNurse.
    /// </summary>
    public static class UserRoles
    {
        public const string Nurse = "Nurse";
        public const string HeadNurse = "HeadNurse";
        public const string Patient = "Patient";
        public const string LegacyPersonnel = "Personnel";

        public static readonly string[] PortalStaff =
        {
            Nurse,
            HeadNurse,
            LegacyPersonnel
        };

        public static bool IsPortalStaff(string? role) =>
            PortalStaff.Any(candidate =>
                string.Equals(candidate, role, StringComparison.OrdinalIgnoreCase));
    }
}
