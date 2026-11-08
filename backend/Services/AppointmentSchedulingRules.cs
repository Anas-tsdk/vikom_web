using backend.Models;

namespace backend.Services
{
    public static class AppointmentSchedulingRules
    {
        public const int VisitBufferMinutes = 10;
        public const int FallbackTravelMinutes = 25;

        private static readonly Dictionary<string, int> TaskDurations = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Medisin"] = 5,
            ["Medication"] = 5,
            ["Bading"] = 25,
            ["Bathing"] = 25,
            ["Matlaging"] = 10,
            ["Cooking"] = 10,
            ["Servering av måltider"] = 10,
            ["Serving Meals"] = 10,
            ["Husholdning"] = 25,
            ["Housekeeping"] = 25,
            ["Digital hjelp"] = 15,
            ["Digital assistance"] = 15,
        };

        public static int CalculateDurationMinutes(string? tasks, int additionalMinutes)
        {
            if (additionalMinutes < 0)
                throw new InvalidOperationException("Additional duration cannot be negative");

            var taskMinutes = (tasks ?? string.Empty)
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Sum(task => (long)TaskDurations.GetValueOrDefault(task));

            var totalMinutes = (long)VisitBufferMinutes + taskMinutes + additionalMinutes;
            if (totalMinutes > TimeSpan.FromDays(1).TotalMinutes)
                throw new InvalidOperationException("A visit cannot exceed 24 hours");

            return (int)totalMinutes;
        }

        public static int EstimateTravelMinutes(User? from, User? to)
        {
            if (!HasCoordinates(from) || !HasCoordinates(to))
                return FallbackTravelMinutes;

            var distanceKm = GreatCircleDistanceKm(
                from!.Latitude!.Value,
                from.Longitude!.Value,
                to!.Latitude!.Value,
                to.Longitude!.Value);

            // A local estimate only: allow for road detours, urban speed and a
            // traffic reserve without sending patient coordinates to a provider.
            var baseDrivingMinutes = distanceKm * 1.35 / 30 * 60;
            return (int)Math.Ceiling(baseDrivingMinutes * 1.25 + 5);
        }

        public static double? DistanceKm(User? from, User? to)
        {
            if (!HasCoordinates(from) || !HasCoordinates(to))
                return null;

            return GreatCircleDistanceKm(
                from!.Latitude!.Value,
                from.Longitude!.Value,
                to!.Latitude!.Value,
                to.Longitude!.Value);
        }

        private static bool HasCoordinates(User? user) =>
            user?.Latitude is double latitude &&
            user.Longitude is double longitude &&
            double.IsFinite(latitude) &&
            double.IsFinite(longitude) &&
            latitude is >= -90 and <= 90 &&
            longitude is >= -180 and <= 180;

        private static double GreatCircleDistanceKm(
            double latitude1,
            double longitude1,
            double latitude2,
            double longitude2)
        {
            const double earthRadiusKm = 6371.0088;
            var latitudeDelta = DegreesToRadians(latitude2 - latitude1);
            var longitudeDelta = DegreesToRadians(longitude2 - longitude1);
            var haversine =
                Math.Pow(Math.Sin(latitudeDelta / 2), 2) +
                Math.Cos(DegreesToRadians(latitude1)) *
                Math.Cos(DegreesToRadians(latitude2)) *
                Math.Pow(Math.Sin(longitudeDelta / 2), 2);

            return earthRadiusKm * 2 * Math.Asin(Math.Sqrt(Math.Clamp(haversine, 0, 1)));
        }

        private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180;
    }
}
