namespace backend.Services
{
    /// <summary>
    /// Derives the status an appointment should be reported as.
    ///
    /// A "Booked" appointment whose end time has passed is reported as
    /// "Completed" without being persisted. This logic used to live inline in
    /// <see cref="AppointmentService"/>.MapToDto only, which meant the REST
    /// responses used the derived status while the realtime broadcast sent the raw
    /// entity status — so a client mixing pushed events with a pulled list could
    /// show two different statuses for the same appointment. Both paths now call
    /// this.
    ///
    /// Note this never writes to the database; it is a presentation concern.
    /// </summary>
    public static class AppointmentStatusResolver
    {
        public static string Resolve(
            string rawStatus,
            DateTime appointmentDate,
            TimeSpan endTime,
            DateTime now)
        {
            if (rawStatus != "Booked")
            {
                return rawStatus;
            }

            var endDateTime = appointmentDate.Date + endTime;

            return endDateTime < now ? "Completed" : rawStatus;
        }
    }
}
