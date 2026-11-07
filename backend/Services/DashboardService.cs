using backend.DTOs;
using backend.DAL.Repositories;

namespace backend.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly IUserRepository _userRepository;
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IPatientUserLinkRepository _linkRepository;

        public DashboardService(
            IUserRepository userRepository,
            IAppointmentRepository appointmentRepository,
            IAvailabilityRepository availabilityRepository,
            IPatientUserLinkRepository linkRepository)
        {
            _userRepository = userRepository;
            _appointmentRepository = appointmentRepository;
            _availabilityRepository = availabilityRepository;
            _linkRepository = linkRepository;
        }

        public async Task<PersonnelDashboardDto> GetPersonnelDashboardAsync(string personnelId)
        {
            var personnelName = await _userRepository.GetFullNameAsync(personnelId);
            var linkedPatients = await _linkRepository.GetBySecondaryUserIdAsync(personnelId);
            var assignedPatientIds = (await _appointmentRepository
                    .GetByPersonnelIdAsync(personnelId))
                .Select(appointment => appointment.PatientId);
            var totalPatients = linkedPatients
                .Select(link => link.PatientId)
                .Concat(assignedPatientIds)
                .Distinct()
                .Count();

            var appointmentsThisWeek = await _appointmentRepository.GetThisWeekCountAsync(personnelId);
            var pendingAppointments = await _appointmentRepository.GetPendingCountAsync(personnelId);
            var cancelledAppointments = await _appointmentRepository.GetCancelledCountAsync(personnelId);
            var today = DateTime.Today;
            var weekEnd = today.AddDays(6);
            
            var upcomingAppointments = await _appointmentRepository.GetUpcomingByPersonnelIdAsync(personnelId, 5);
            var recentAppointments = await _appointmentRepository.GetRecentByPersonnelIdAsync(personnelId, 2);
            var upcomingAvailability = (await _availabilityRepository.GetUpcomingByPersonnelIdAsync(personnelId, 400))
                .Where(availability => availability.Date >= today && availability.Date <= weekEnd)
                .OrderBy(availability => availability.Date)
                .ThenBy(availability => availability.StartTime)
                .ToList();

            return new PersonnelDashboardDto
            {
                PersonnelId = personnelId,
                PersonnelName = personnelName,
                TotalPatients = totalPatients,
                AppointmentsThisWeek = appointmentsThisWeek,
                PendingAppointments = pendingAppointments,
                CancelledAppointments = cancelledAppointments,
                UpcomingAppointments = upcomingAppointments
                    .Select(appointment => AppointmentSummaryMapper.Map(appointment))
                    .ToList(),
                RecentAppointments = recentAppointments
                    .Select(appointment => AppointmentSummaryMapper.Map(appointment))
                    .ToList(),
                UpcomingAvailability = upcomingAvailability.Select(MapToAvailabilitySummary).ToList()
            };
        }

        public async Task<PatientDashboardDto> GetPatientDashboardAsync(
            string patientId,
            string? viewerPersonnelId = null)
        {
            var patientName = await _userRepository.GetFullNameAsync(patientId);
            var appointments = (await _appointmentRepository.GetByPatientIdAsync(patientId))
                .Where(appointment =>
                    viewerPersonnelId == null ||
                    appointment.Availability?.PersonnelId == viewerPersonnelId)
                .ToList();
            var totalAppointments = appointments.Count;
            var completedAppointments = appointments.Count(appointment =>
                appointment.Status == "Completed");
            var today = DateTime.Today;
            var upcomingAppointments = appointments
                .Where(appointment =>
                    appointment.Availability.Date >= today &&
                    (appointment.Status == "Booked" || appointment.Status == "InProgress"))
                .OrderBy(appointment => appointment.Availability.Date)
                .ThenBy(appointment => appointment.StartTime)
                .Take(10)
                .ToList();
            var appointmentHistory = appointments
                .Where(appointment => appointment.Availability.Date < today)
                .OrderByDescending(appointment => appointment.Availability.Date)
                .ThenByDescending(appointment => appointment.StartTime)
                .ToList();

            var caregivers = new List<CaregiverSummaryDto>();
            // The organization-wide availability directory is a planning tool
            // for head nurses. A normal nurse receives no colleague schedule
            // metadata through the patient-dashboard endpoint.
            if (viewerPersonnelId == null)
            {
                var freeAvailabilities = await _availabilityRepository.GetFreeAsync();
                var personnelIds = freeAvailabilities
                    .Select(availability => availability.PersonnelId)
                    .Distinct()
                    .ToList();

                foreach (var personnelId in personnelIds)
                {
                    var personnel = await _userRepository.GetByIdAsync(personnelId);
                    if (personnel != null)
                    {
                        var nextAvailable = freeAvailabilities
                            .Where(availability => availability.PersonnelId == personnelId)
                            .OrderBy(availability => availability.Date)
                            .FirstOrDefault();

                        caregivers.Add(new CaregiverSummaryDto
                        {
                            PersonnelId = personnel.Id,
                            PersonnelName = personnel.FullName,
                            Email = personnel.Email ?? string.Empty,
                            NextAvailableDate = nextAvailable?.Date.ToString("yyyy-MM-dd") ?? string.Empty
                        });
                    }
                }
            }

            return new PatientDashboardDto
            {
                PatientId = patientId,
                PatientName = patientName,
                TotalAppointments = totalAppointments,
                CompletedAppointments = completedAppointments,
                UpcomingAppointments = upcomingAppointments
                    .Select(appointment => AppointmentSummaryMapper.Map(appointment, viewerPersonnelId))
                    .ToList(),
                AppointmentHistory = appointmentHistory
                    .Select(appointment => AppointmentSummaryMapper.Map(appointment, viewerPersonnelId))
                    .ToList(),
                AvailableCaregivers = caregivers
            };
        }



        private static AvailabilitySummaryDto MapToAvailabilitySummary(Models.Availability availability)
        {
            return new AvailabilitySummaryDto
            {
                Id = availability.Id,
                Date = availability.Date,
                StartTime = availability.StartTime.ToString(@"hh\:mm"),
                EndTime = availability.EndTime.ToString(@"hh\:mm"),
                Notes = availability.Notes ?? string.Empty,
                IsBooked = availability.Appointment != null
            };
        }
    }
}
