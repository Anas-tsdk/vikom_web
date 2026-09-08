using backend.Services;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Locks in the rule that the realtime broadcast and the REST responses report the
/// same status for an appointment. Both call AppointmentStatusResolver.Resolve.
/// </summary>
public class AppointmentStatusResolverTests
{
    private static readonly DateTime Date = new(2026, 8, 20);
    private static readonly TimeSpan EndTime = new(11, 0, 0);

    [Fact]
    public void Booked_AppointmentThatHasEnded_IsReportedAsCompleted()
    {
        var now = new DateTime(2026, 8, 20, 12, 0, 0);

        var status = AppointmentStatusResolver.Resolve("Booked", Date, EndTime, now);

        Assert.Equal("Completed", status);
    }

    [Fact]
    public void Booked_AppointmentStillInTheFuture_StaysBooked()
    {
        var now = new DateTime(2026, 8, 20, 9, 0, 0);

        var status = AppointmentStatusResolver.Resolve("Booked", Date, EndTime, now);

        Assert.Equal("Booked", status);
    }

    [Fact]
    public void Booked_AppointmentEndingExactlyNow_StaysBooked()
    {
        // Boundary: the comparison is strictly "end is before now", so an
        // appointment ending this instant has not yet completed.
        var now = new DateTime(2026, 8, 20, 11, 0, 0);

        var status = AppointmentStatusResolver.Resolve("Booked", Date, EndTime, now);

        Assert.Equal("Booked", status);
    }

    [Theory]
    [InlineData("Cancelled")]
    [InlineData("InProgress")]
    [InlineData("Completed")]
    [InlineData("NotCompleted")]
    public void NonBookedStatuses_ArePassedThroughEvenWhenPast(string rawStatus)
    {
        var now = new DateTime(2026, 8, 20, 12, 0, 0);

        var status = AppointmentStatusResolver.Resolve(rawStatus, Date, EndTime, now);

        Assert.Equal(rawStatus, status);
    }

    [Fact]
    public void TimeOfDayIsHonoured_NotJustTheDate()
    {
        // Same calendar day, one minute before the appointment ends.
        var now = new DateTime(2026, 8, 20, 10, 59, 0);

        var status = AppointmentStatusResolver.Resolve("Booked", Date, EndTime, now);

        Assert.Equal("Booked", status);
    }
}
