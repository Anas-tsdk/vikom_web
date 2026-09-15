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
            string patientResponseStatus,
            string shortMessage,
            string? patientName = null,
            string? patientProposedDate = null,
            string? patientProposedStartTime = null,
            string? patientProposedEndTime = null)
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
                ["patientResponseStatus"] = patientResponseStatus,
                ["shortMessage"] = shortMessage,
                ["patientName"] = patientName,
                ["patientProposedDate"] = patientProposedDate,
                ["patientProposedStartTime"] = patientProposedStartTime,
                ["patientProposedEndTime"] = patientProposedEndTime
            };
        }

        public static Dictionary<string, object?> BuildWrapper(
            string targetUserId,
            Dictionary<string, object?> payload,
            string eventType = "appointment_event")
        {
            return new Dictionary<string, object?>
            {
                ["targetUserId"] = targetUserId,
                ["type"] = eventType,
                ["payload"] = JsonSerializer.Serialize(payload)
            };
        }
    }
}
