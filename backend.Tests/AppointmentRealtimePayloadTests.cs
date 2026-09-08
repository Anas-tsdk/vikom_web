using backend.Services;
using Xunit;

namespace backend.Tests;

public class AppointmentRealtimePayloadTests
{
    [Fact]
    public void BuildAppointmentEventPayload_UsesExpectedShape()
    {
        var payload = AppointmentRealtimeEventService.BuildPayload(
            appointmentId: 42,
            action: "created",
            date: "2026-08-10",
            startTime: "10:00",
            endTime: "11:00",
            personnelName: "Nurse Nora",
            status: "Booked",
            shortMessage: "Visit scheduled"
        );

        var wrapper = AppointmentRealtimeEventService.BuildWrapper("profile-123", payload);

        Assert.Equal("appointment_event", wrapper["type"]!.ToString());
        Assert.Equal("profile-123", wrapper["targetUserId"]!.ToString());
        Assert.NotNull(wrapper["payload"]);
    }
}
