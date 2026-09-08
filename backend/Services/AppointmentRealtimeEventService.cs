using System.Text.Json;

namespace backend.Services
{
    public static class AppointmentRealtimeEventService
    {
        public static Dictionary<string, object?> BuildPayload(
            int appointmentId,
            string action,
            string date,
            string startTime,
            string endTime,
            string personnelName,
            string status,
            string shortMessage)
        {
            return new Dictionary<string, object?>
            {
                ["appointmentId"] = appointmentId,
                ["action"] = action,
                ["date"] = date,
                ["startTime"] = startTime,
                ["endTime"] = endTime,
                ["personnelName"] = personnelName,
                ["status"] = status,
                ["shortMessage"] = shortMessage
            };
        }

        public static Dictionary<string, object?> BuildWrapper(string targetUserId, Dictionary<string, object?> payload)
        {
            return new Dictionary<string, object?>
            {
                ["targetUserId"] = targetUserId,
                ["type"] = "appointment_event",
                ["payload"] = JsonSerializer.Serialize(payload)
            };
        }
    }
}
