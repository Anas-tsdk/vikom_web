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
            var totalPatients = linkedPatients.Count();

            if (totalPatients == 0)
            {
                // Fallback for old databases or missing link data
                totalPatients = await _appointmentRepository.GetDistinctPatientCountAsync(personnelId);
            }

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
                UpcomingAppointments = upcomingAppointments.Select(MapToAppointmentSummary).ToList(),
                RecentAppointments = recentAppointments.Select(MapToAppointmentSummary).ToList(),
                UpcomingAvailability = upcomingAvailability.Select(MapToAvailabilitySummary).ToList()
            };
        }

        public async Task<PatientDashboardDto> GetPatientDashboardAsync(string patientId)
        {
            var patientName = await _userRepository.GetFullNameAsync(patientId);
            var totalAppointments = await _appointmentRepository.GetTotalByPatientIdAsync(patientId);
            var completedAppointments = await _appointmentRepository.GetCompletedByPatientIdAsync(patientId);
            
            var upcomingAppointments = await _appointmentRepository.GetUpcomingByPatientIdAsync(patientId, 10);
            var appointmentHistory = await _appointmentRepository.GetHistoryByPatientIdAsync(patientId);
            
            // Get all personnel who have upcoming free availability
            var freeAvailabilities = await _availabilityRepository.GetFreeAsync();
            var personnelIds = freeAvailabilities.Select(a => a.PersonnelId).Distinct().ToList();
            
            var caregivers = new List<CaregiverSummaryDto>();
            foreach (var pid in personnelIds)
            {
                var personnel = await _userRepository.GetByIdAsync(pid);
                if (personnel != null)
                {
                    var nextAvailable = freeAvailabilities
                        .Where(a => a.PersonnelId == pid)
                        .OrderBy(a => a.Date)
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

            return new PatientDashboardDto
            {
                PatientId = patientId,
                PatientName = patientName,
                TotalAppointments = totalAppointments,
                CompletedAppointments = completedAppointments,
                UpcomingAppointments = upcomingAppointments.Select(MapToAppointmentSummary).ToList(),
                AppointmentHistory = appointmentHistory.Select(MapToAppointmentSummary).ToList(),
                AvailableCaregivers = caregivers
            };
        }

        private static AppointmentSummaryDto MapToAppointmentSummary(Models.Appointment appointment)
        {
            return new AppointmentSummaryDto
            {
                Id = appointment.Id,
                PatientName = appointment.Patient?.FullName ?? string.Empty,
                PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
                Tasks = appointment.Tasks,
                Date = appointment.Availability?.Date ?? DateTime.MinValue,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = appointment.Status,
                FormattedDateTime = $"{appointment.Availability?.Date:yyyy-MM-dd} {appointment.StartTime:hh\\:mm}-{appointment.EndTime:hh\\:mm}",
                AvailabilityNotes = appointment.Availability?.Notes ?? string.Empty
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
