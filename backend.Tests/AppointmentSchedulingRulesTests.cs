using backend.Models;
using backend.Services;
using Xunit;

namespace backend.Tests;

public sealed class AppointmentSchedulingRulesTests
{
    [Theory]
    [InlineData("Medisin", 15)]
    [InlineData("Bading", 25)]
    [InlineData("Servering av måltider", 20)]
    [InlineData("Husholdning", 35)]
    [InlineData("Digital hjelp", 25)]
    [InlineData("Annet", 10)]
    public void Individual_task_duration_includes_both_visit_buffers(string task, int expectedMinutes)
    {
        Assert.Equal(expectedMinutes, AppointmentSchedulingRules.CalculateDurationMinutes(task, 0));
    }

    [Fact]
    public void Visit_duration_includes_task_times_buffers_and_head_nurse_extra()
    {
        var duration = AppointmentSchedulingRules.CalculateDurationMinutes(
            "Medisin, Bading, Servering av måltider, Husholdning, Digital hjelp, Annet",
            10);

        Assert.Equal(90, duration);
    }

    [Fact]
    public void Legacy_cooking_label_keeps_its_duration_and_legacy_non_timed_tasks_add_none()
    {
        var duration = AppointmentSchedulingRules.CalculateDurationMinutes(
            "Matlaging, Handel, Transport",
            0);

        Assert.Equal(20, duration);
    }

    [Fact]
    public void Travel_estimate_uses_the_fallback_when_coordinates_are_unavailable()
    {
        Assert.Equal(
            AppointmentSchedulingRules.FallbackTravelMinutes,
            AppointmentSchedulingRules.EstimateTravelMinutes(null, null));
    }

    [Fact]
    public void Travel_estimate_adds_a_five_minute_buffer_even_for_the_same_location()
    {
        var patient = new User { Latitude = 59.91, Longitude = 10.75 };

        Assert.Equal(5, AppointmentSchedulingRules.EstimateTravelMinutes(patient, patient));
    }
}
