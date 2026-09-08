using backend.DTOs;
using backend.Models;
using backend.DAL.Repositories;

namespace backend.Services
{
    public class AvailabilityService : IAvailabilityService
    {
        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IAvailabilityWindowRepository _windowRepository;
        private readonly IAppointmentRepository _appointmentRepository;

        public AvailabilityService(
            IAvailabilityRepository availabilityRepository,
            IAvailabilityWindowRepository windowRepository,
            IAppointmentRepository appointmentRepository)
        {
            _availabilityRepository = availabilityRepository;
            _windowRepository = windowRepository;
            _appointmentRepository = appointmentRepository;
        }

        public async Task<IEnumerable<AvailabilityDto>> GetAllAsync()
        {
            var availabilities = await _availabilityRepository.GetAllAsync();
            return availabilities.Select(MapToDto);
        }

        public async Task<AvailabilityDto?> GetByIdAsync(int id)
        {
            var availability = await _availabilityRepository.GetByIdAsync(id);
            return availability == null ? null : MapToDto(availability);
        }

        public async Task<IEnumerable<AvailabilityDto>> GetByPersonnelIdAsync(string personnelId)
        {
            var availabilities = await _availabilityRepository.GetByPersonnelIdAsync(personnelId);
            return availabilities.Select(MapToDto);
        }

        public async Task<IEnumerable<AvailabilityDto>> GetFreeAsync()
        {
            var availabilities = await _availabilityRepository.GetFreeAsync();
            return availabilities.Select(MapToDto);
        }

        public async Task<AvailabilityDto> CreateAsync(AvailabilityDto availabilityDto)
        {
            var availability = new Availability
            {
                PersonnelId = availabilityDto.PersonnelId,
                Date = DateTime.Parse(availabilityDto.Date!),
                StartTime = TimeSpan.Parse(availabilityDto.StartTime!),
                EndTime = TimeSpan.Parse(availabilityDto.EndTime!),
                Notes = availabilityDto.Notes ?? string.Empty
            };

            var created = await _availabilityRepository.CreateAsync(availability);
            var result = await _availabilityRepository.GetByIdAsync(created.Id);
            return MapToDto(result!);
        }

        public async Task<AvailabilityDto> UpdateAsync(int id, AvailabilityDto availabilityDto)
        {
            var existing = await _availabilityRepository.GetByIdAsync(id);
            if (existing == null)
                throw new InvalidOperationException("Availability not found");

            if (existing.Appointment != null)
                throw new InvalidOperationException("Cannot update booked availability");

            existing.Date = DateTime.Parse(availabilityDto.Date!);
            existing.StartTime = TimeSpan.Parse(availabilityDto.StartTime!);
            existing.EndTime = TimeSpan.Parse(availabilityDto.EndTime!);
            existing.Notes = availabilityDto.Notes ?? string.Empty;

            var updated = await _availabilityRepository.UpdateAsync(existing);
            var result = await _availabilityRepository.GetByIdAsync(updated.Id);
            return MapToDto(result!);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var existing = await _availabilityRepository.GetByIdAsync(id);
            if (existing == null)
                throw new InvalidOperationException("Availability not found");

            if (existing.Appointment != null)
                throw new InvalidOperationException("Cannot delete booked availability");

            return await _availabilityRepository.DeleteAsync(id);
        }

        private static AvailabilityDto MapToDto(Availability availability)
        {
            return new AvailabilityDto
            {
                Id = availability.Id,
                PersonnelId = availability.PersonnelId,
                PersonnelName = availability.Personnel?.FullName ?? string.Empty,
                Date = availability.Date.ToString("yyyy-MM-dd"),
                StartTime = availability.StartTime.ToString(@"hh\:mm"),
                EndTime = availability.EndTime.ToString(@"hh\:mm"),
                Notes = availability.Notes,
                IsBooked = availability.Appointment != null
            };
        }

        // ============ NEW WINDOW-BASED METHODS ============

        public async Task<WeekAvailabilityDto> GetWeekAvailabilityAsync(string personnelId, DateTime startDate)
        {
            // Ensure startDate is Monday
            var monday = startDate.AddDays(-(int)startDate.DayOfWeek + (startDate.DayOfWeek == DayOfWeek.Sunday ? -6 : 1));
            var sunday = monday.AddDays(6);

            var windows = await _windowRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, monday, sunday);
            var appointments = await _appointmentRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, monday, sunday);

            var weekDto = new WeekAvailabilityDto
            {
                StartDate = monday.ToString("yyyy-MM-dd"),
                EndDate = sunday.ToString("yyyy-MM-dd"),
                Days = new List<DayAvailabilityDto>()
            };

            // Generate 7 days
            for (int i = 0; i < 7; i++)
            {
                var currentDate = monday.AddDays(i);
                var dayWindows = windows.Where(w => w.Date.Date == currentDate.Date).ToList();
                var dayAppointments = appointments.Where(a => a.Availability.Date.Date == currentDate.Date).ToList();

                weekDto.Days.Add(CreateDayAvailabilityDto(currentDate, dayWindows, dayAppointments));
            }

            return weekDto;
        }

        public async Task<DayAvailabilityDto> GetDayAvailabilityAsync(string personnelId, DateTime date)
        {
            var windows = await _windowRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, date.Date, date.Date);
            var appointments = await _appointmentRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, date.Date, date.Date);

            return CreateDayAvailabilityDto(date, windows.ToList(), appointments.ToList());
        }

        public async Task<AvailabilityWindowDto> CreateWindowAsync(string personnelId, CreateAvailabilityWindowDto dto)
        {
            var window = new AvailabilityWindow
            {
                PersonnelId = personnelId,
                Date = DateTime.Parse(dto.Date),
                Notes = dto.Notes,
                IsAvailable = dto.IsAvailable
            };

            // Apply default time range if available and no times specified
            if (dto.IsAvailable && string.IsNullOrEmpty(dto.StartTime) && string.IsNullOrEmpty(dto.EndTime))
            {
                window.StartTime = TimeSpan.FromHours(9);  // 09:00
                window.EndTime = TimeSpan.FromHours(17);   // 17:00
            }
            else
            {
                window.StartTime = string.IsNullOrEmpty(dto.StartTime) ? TimeSpan.Zero : TimeSpan.Parse(dto.StartTime);
                window.EndTime = string.IsNullOrEmpty(dto.EndTime) ? TimeSpan.Zero : TimeSpan.Parse(dto.EndTime);
            }

            // Generate slots
            var slots = GenerateSlots(window);
            window.Slots = slots;

            var created = await _windowRepository.CreateAsync(window);
            var result = await _windowRepository.GetByIdAsync(created.Id);
            return MapWindowToDto(result!);
        }

        public async Task<AvailabilityWindowDto> UpdateWindowAsync(int id, UpdateAvailabilityWindowDto dto)
        {
            var existing = await _windowRepository.GetByIdAsync(id);
            if (existing == null)
                throw new InvalidOperationException("Availability window not found");

            // Check if any slot is booked
            if (existing.Slots.Any(s => s.Appointment != null))
            {
                // Prevent toggling to unavailable
                if (!dto.IsAvailable)
                    throw new InvalidOperationException("Cannot mark as unavailable - some slots are booked");
                    
                // If time range changed, prevent update
                var newStartTime = string.IsNullOrEmpty(dto.StartTime) ? existing.StartTime : TimeSpan.Parse(dto.StartTime);
                var newEndTime = string.IsNullOrEmpty(dto.EndTime) ? existing.EndTime : TimeSpan.Parse(dto.EndTime);
                
                if (existing.StartTime != newStartTime || existing.EndTime != newEndTime)
                    throw new InvalidOperationException("Cannot change time range - some slots are booked");
            }

            existing.Date = DateTime.Parse(dto.Date);
            existing.Notes = dto.Notes;
            existing.IsAvailable = dto.IsAvailable;

            // Update time range
            if (dto.IsAvailable && string.IsNullOrEmpty(dto.StartTime) && string.IsNullOrEmpty(dto.EndTime))
            {
                existing.StartTime = TimeSpan.FromHours(9);
                existing.EndTime = TimeSpan.FromHours(17);
            }
            else
            {
                existing.StartTime = string.IsNullOrEmpty(dto.StartTime) ? existing.StartTime : TimeSpan.Parse(dto.StartTime);
                existing.EndTime = string.IsNullOrEmpty(dto.EndTime) ? existing.EndTime : TimeSpan.Parse(dto.EndTime);
            }

            // Delete unbooked slots
            var unbookedSlots = existing.Slots.Where(s => s.Appointment == null).ToList();
            foreach (var slot in unbookedSlots)
            {
                await _availabilityRepository.DeleteAsync(slot.Id);
            }

            // Regenerate ALL slots (this creates a fresh set, existing booked slots remain via their appointments)
            var allNewSlots = GenerateSlots(existing);
            
            // Keep track of booked slots' time ranges
            var bookedTimeRanges = existing.Slots
                .Where(s => s.Appointment != null)
                .Select(s => new { s.StartTime, s.EndTime })
                .ToList();
            
            // Only create slots that don't overlap with booked slots
            foreach (var newSlot in allNewSlots)
            {
                bool overlapsWithBooked = bookedTimeRanges.Any(b => 
                    b.StartTime == newSlot.StartTime && b.EndTime == newSlot.EndTime);
                
                if (!overlapsWithBooked)
                {
                    await _availabilityRepository.CreateAsync(newSlot);
                }
            }

            var updated = await _windowRepository.UpdateAsync(existing);
            var result = await _windowRepository.GetByIdAsync(updated.Id);
            return MapWindowToDto(result!);
        }

        public async Task<bool> DeleteWindowAsync(int id)
        {
            var existing = await _windowRepository.GetByIdAsync(id);
            if (existing == null)
                throw new InvalidOperationException("Availability window not found");

            // Check if any slot is booked
            if (existing.Slots.Any(s => s.Appointment != null))
                throw new InvalidOperationException("Cannot delete window - some slots are booked");

            return await _windowRepository.DeleteAsync(id);
        }

        // ============ HELPER METHODS ============

        private DayAvailabilityDto CreateDayAvailabilityDto(
            DateTime date, 
            List<AvailabilityWindow> windows, 
            List<Appointment> appointments)
        {
            string status = "Free";
            if (windows.Any())
            {
                status = windows.Any(w => w.IsAvailable) ? "Available" : "Unavailable";
            }

            // Filter appointments for this specific date
            var dayAppointments = appointments
                .Where(a => a.Availability != null && a.Availability.Date.Date == date.Date)
                .ToList();

            return new DayAvailabilityDto
            {
                Date = date.ToString("yyyy-MM-dd"),
                Status = status,
                Windows = windows.Select(MapWindowToDto).ToList(),
                Appointments = dayAppointments.Select(MapAppointmentToSummary).ToList()
            };
        }

        private List<Availability> GenerateSlots(AvailabilityWindow window)
        {
            var slots = new List<Availability>();

            if (!window.IsAvailable)
            {
                // Unavailable: create single slot covering the whole period
                slots.Add(new Availability
                {
                    PersonnelId = window.PersonnelId,
                    Date = window.Date,
                    StartTime = window.StartTime,
                    EndTime = window.EndTime,
                    Notes = window.Notes,
                    AvailabilityWindowId = window.Id
                });
            }
            else
            {
                // Available: 1-hour appointments with 30-minute travel buffer between visits.
                var slotDuration = TimeSpan.FromHours(1);
                var travelDuration = TimeSpan.FromMinutes(30);
                var currentTime = window.StartTime;

                while (currentTime < window.EndTime)
                {
                    var slotEnd = currentTime.Add(slotDuration);
                    if (slotEnd > window.EndTime)
                        break;

                    slots.Add(new Availability
                    {
                        PersonnelId = window.PersonnelId,
                        Date = window.Date,
                        StartTime = currentTime,
                        EndTime = slotEnd,
                        Notes = window.Notes,
                        AvailabilityWindowId = window.Id
                    });

                    currentTime = slotEnd.Add(travelDuration);
                }
            }

            return slots;
        }

        private static AvailabilityWindowDto MapWindowToDto(AvailabilityWindow window)
        {
            return new AvailabilityWindowDto
            {
                Id = window.Id,
                PersonnelId = window.PersonnelId,
                PersonnelName = window.Personnel?.FullName ?? string.Empty,
                Date = window.Date.ToString("yyyy-MM-dd"),
                StartTime = window.StartTime.ToString(@"hh\:mm"),
                EndTime = window.EndTime.ToString(@"hh\:mm"),
                Notes = window.Notes,
                IsAvailable = window.IsAvailable,
                Slots = window.Slots.Select(s => new AvailabilitySlotDto
                {
                    Id = s.Id,
                    StartTime = s.StartTime.ToString(@"hh\:mm"),
                    EndTime = s.EndTime.ToString(@"hh\:mm"),
                    IsBooked = s.Appointment != null
                }).ToList()
            };
        }

        private static AppointmentSummaryDto MapAppointmentToSummary(Appointment appointment)
        {
            return new AppointmentSummaryDto
            {
                Id = appointment.Id,
                PatientName = appointment.Patient?.FullName ?? "Unknown",
                Tasks = appointment.Tasks,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = appointment.Status
            };
        }
    }
}
