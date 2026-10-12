using backend.DTOs;
using backend.Models;
using backend.DAL.Repositories;
using backend.DAL;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace backend.Services
{
    public class AvailabilityService : IAvailabilityService
    {
        // Week/day reads materialize recurring rules into dated windows. Several
        // browser mounts (or two head nurses) can request the same nurse at once,
        // so serialize that write path per stable personnel ID.
        private static readonly ConcurrentDictionary<string, SemaphoreSlim>
            MaterializationLocks = new(StringComparer.Ordinal);

        private readonly IAvailabilityRepository _availabilityRepository;
        private readonly IAvailabilityWindowRepository _windowRepository;
        private readonly IAppointmentRepository _appointmentRepository;
        private readonly ApplicationDbContext _context;

        public AvailabilityService(
            IAvailabilityRepository availabilityRepository,
            IAvailabilityWindowRepository windowRepository,
            IAppointmentRepository appointmentRepository,
            ApplicationDbContext context)
        {
            _availabilityRepository = availabilityRepository;
            _windowRepository = windowRepository;
            _appointmentRepository = appointmentRepository;
            _context = context;
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

            await MaterializeWeeklyScheduleAsync(personnelId, monday, sunday);

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
            await MaterializeWeeklyScheduleAsync(personnelId, date.Date, date.Date);
            var windows = await _windowRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, date.Date, date.Date);
            var appointments = await _appointmentRepository.GetByPersonnelIdAndDateRangeAsync(personnelId, date.Date, date.Date);

            return CreateDayAvailabilityDto(date, windows.ToList(), appointments.ToList());
        }

        public async Task<AvailabilityWindowDto?> GetWindowByIdAsync(int id)
        {
            var window = await _windowRepository.GetByIdAsync(id);
            return window == null ? null : MapWindowToDto(window);
        }

        public async Task<AvailabilityWindowDto> CreateWindowAsync(string personnelId, CreateAvailabilityWindowDto dto)
        {
            var date = ParseDate(dto.Date);
            if (dto.ApplyToWeek)
            {
                await using var transaction = await _context.Database.BeginTransactionAsync();
                var monday = StartOfWeek(date);
                AvailabilityWindow? selected = null;
                for (var offset = 0; offset < 7; offset++)
                {
                    var saved = await UpsertManualWindowAsync(
                        personnelId, monday.AddDays(offset), dto.IsAvailable,
                        dto.StartTime, dto.EndTime, dto.Notes);
                    if (saved.Date == date) selected = saved;
                }
                await transaction.CommitAsync();
                return MapWindowToDto(selected!);
            }

            return MapWindowToDto(await UpsertManualWindowAsync(
                personnelId, date, dto.IsAvailable, dto.StartTime, dto.EndTime, dto.Notes));
        }

        public async Task<AvailabilityWindowDto> UpdateWindowAsync(string personnelId, int id, UpdateAvailabilityWindowDto dto)
        {
            var existing = await _windowRepository.GetByIdAsync(id);
            if (existing == null || existing.PersonnelId != personnelId)
                throw new InvalidOperationException("Availability window not found");
            var date = ParseDate(dto.Date);
            if (dto.ApplyToWeek)
            {
                await using var transaction = await _context.Database.BeginTransactionAsync();
                var monday = StartOfWeek(date);
                AvailabilityWindow? selected = null;
                for (var offset = 0; offset < 7; offset++)
                {
                    var saved = await UpsertManualWindowAsync(
                        personnelId, monday.AddDays(offset), dto.IsAvailable,
                        dto.StartTime, dto.EndTime, dto.Notes);
                    if (saved.Date == date) selected = saved;
                }
                await transaction.CommitAsync();
                return MapWindowToDto(selected!);
            }

            return MapWindowToDto(await UpsertManualWindowAsync(
                personnelId, date, dto.IsAvailable, dto.StartTime, dto.EndTime, dto.Notes, existing));
        }

        public async Task<bool> DeleteWindowAsync(string personnelId, int id)
        {
            var existing = await _windowRepository.GetByIdAsync(id);
            if (existing == null || existing.PersonnelId != personnelId)
                throw new InvalidOperationException("Availability window not found");

            // Check if any slot is booked
            if (existing.Slots.Any(s => s.Appointment != null))
                throw new InvalidOperationException("Cannot delete window - some slots are booked");

            return await _windowRepository.DeleteAsync(id);
        }

        public async Task<IReadOnlyList<WeeklyAvailabilityRuleDto>> GetWeeklyScheduleAsync(string personnelId)
        {
            var scheduleLock = ScheduleLockFor(personnelId);
            await scheduleLock.WaitAsync();
            try
            {
                var rules = await EnsureWeeklyRulesAsync(personnelId);
                return rules.OrderBy(r => MondayFirst(r.DayOfWeek)).Select(MapWeeklyRuleToDto).ToList();
            }
            finally
            {
                scheduleLock.Release();
            }
        }

        public async Task<IReadOnlyList<WeeklyAvailabilityRuleDto>> UpdateWeeklyScheduleAsync(
            string personnelId,
            IReadOnlyList<WeeklyAvailabilityRuleDto> rules)
        {
            if (rules.Count != 7 || rules.Select(r => r.DayOfWeek).Distinct().Count() != 7)
                throw new InvalidOperationException("The weekly schedule must contain each day exactly once");

            var scheduleLock = ScheduleLockFor(personnelId);
            await scheduleLock.WaitAsync();
            try
            {
                var stored = await EnsureWeeklyRulesAsync(personnelId);
                foreach (var dto in rules)
                {
                    var rule = stored.Single(r => r.DayOfWeek == dto.DayOfWeek);
                    var times = NormalizeTimes(dto.IsAvailable, dto.StartTime, dto.EndTime);
                    rule.IsAvailable = dto.IsAvailable;
                    rule.StartTime = times.Start;
                    rule.EndTime = times.End;
                    rule.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
                }
                await _context.SaveChangesAsync();

                // Keep already materialized recurring dates in sync, without ever
                // touching a manual override or a day that has a booked slot.
                var generatedWindows = await _context.AvailabilityWindows
                    .Include(w => w.Slots).ThenInclude(s => s.Appointment)
                    .Where(w => w.PersonnelId == personnelId && w.IsGeneratedFromWeeklySchedule)
                    .ToListAsync();
                foreach (var window in generatedWindows.Where(w => !w.Slots.Any(s => s.Appointment != null)))
                {
                    var rule = stored.Single(r => r.DayOfWeek == (int)window.Date.DayOfWeek);
                    ApplyRuleToWindow(window, rule);
                    ReplaceUnbookedSlots(window);
                }
                await _context.SaveChangesAsync();
                return stored.OrderBy(r => MondayFirst(r.DayOfWeek)).Select(MapWeeklyRuleToDto).ToList();
            }
            finally
            {
                scheduleLock.Release();
            }
        }

        private async Task<List<WeeklyAvailabilityRule>> EnsureWeeklyRulesAsync(string personnelId)
        {
            var rules = await _context.WeeklyAvailabilityRules
                .Where(r => r.PersonnelId == personnelId)
                .ToListAsync();
            for (var day = 0; day < 7; day++)
            {
                if (rules.Any(r => r.DayOfWeek == day)) continue;
                var isWeekday = day is >= 1 and <= 5;
                var rule = new WeeklyAvailabilityRule
                {
                    PersonnelId = personnelId,
                    DayOfWeek = day,
                    IsAvailable = isWeekday,
                    StartTime = isWeekday ? TimeSpan.FromHours(9) : TimeSpan.Zero,
                    EndTime = isWeekday ? TimeSpan.FromHours(17) : TimeSpan.Zero,
                };
                rules.Add(rule);
                _context.WeeklyAvailabilityRules.Add(rule);
            }
            await _context.SaveChangesAsync();
            return rules;
        }

        private async Task MaterializeWeeklyScheduleAsync(string personnelId, DateTime start, DateTime end)
        {
            var materializationLock = ScheduleLockFor(personnelId);
            await materializationLock.WaitAsync();
            try
            {
                var rules = await EnsureWeeklyRulesAsync(personnelId);
                var windows = await _context.AvailabilityWindows
                    .Include(w => w.Slots).ThenInclude(s => s.Appointment)
                    .Where(w => w.PersonnelId == personnelId && w.Date >= start.Date && w.Date <= end.Date)
                    .ToListAsync();

                for (var date = start.Date; date <= end.Date; date = date.AddDays(1))
                {
                    var rule = rules.Single(r => r.DayOfWeek == (int)date.DayOfWeek);
                    var window = windows.SingleOrDefault(w => w.Date == date);
                    if (window == null)
                    {
                        window = new AvailabilityWindow
                        {
                            PersonnelId = personnelId,
                            Date = date,
                            IsGeneratedFromWeeklySchedule = true,
                        };
                        ApplyRuleToWindow(window, rule);
                        window.Slots = GenerateSlots(window);
                        _context.AvailabilityWindows.Add(window);
                        windows.Add(window);
                    }
                    else if (window.IsGeneratedFromWeeklySchedule && !window.Slots.Any(s => s.Appointment != null))
                    {
                        ApplyRuleToWindow(window, rule);
                    }

                    if (window != null && !HasExpectedSlotGrid(window))
                        ReplaceUnbookedSlots(window);
                }
                await _context.SaveChangesAsync();
            }
            finally
            {
                materializationLock.Release();
            }
        }

        private static SemaphoreSlim ScheduleLockFor(string personnelId) =>
            MaterializationLocks.GetOrAdd(personnelId, static _ => new SemaphoreSlim(1, 1));

        private async Task<AvailabilityWindow> UpsertManualWindowAsync(
            string personnelId,
            DateTime date,
            bool isAvailable,
            string? startTime,
            string? endTime,
            string? notes,
            AvailabilityWindow? existing = null)
        {
            var times = NormalizeTimes(isAvailable, startTime, endTime);
            existing ??= await _context.AvailabilityWindows
                .Include(w => w.Slots).ThenInclude(s => s.Appointment)
                .SingleOrDefaultAsync(w => w.PersonnelId == personnelId && w.Date == date.Date);

            if (existing != null && existing.PersonnelId != personnelId)
                throw new InvalidOperationException("Availability window not found");
            if (existing?.Slots.Any(s => s.Appointment != null) == true &&
                (!isAvailable || existing.StartTime != times.Start || existing.EndTime != times.End))
                throw new InvalidOperationException("Cannot change a time range that contains booked appointments");

            var window = existing ?? new AvailabilityWindow { PersonnelId = personnelId };
            window.Date = date.Date;
            window.IsAvailable = isAvailable;
            window.StartTime = times.Start;
            window.EndTime = times.End;
            window.Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
            window.IsGeneratedFromWeeklySchedule = false;
            if (existing == null) _context.AvailabilityWindows.Add(window);
            ReplaceUnbookedSlots(window);
            await _context.SaveChangesAsync();

            return (await _windowRepository.GetByIdAsync(window.Id))!;
        }

        private void ReplaceUnbookedSlots(AvailabilityWindow window)
        {
            var unbooked = window.Slots.Where(s => s.Appointment == null).ToList();
            _context.Availabilities.RemoveRange(unbooked);
            foreach (var slot in unbooked) window.Slots.Remove(slot);

            var bookedStarts = window.Slots
                .Where(s => s.Appointment != null)
                .Select(s => s.StartTime)
                .ToHashSet();
            foreach (var slot in GenerateSlots(window).Where(s => !bookedStarts.Contains(s.StartTime)))
                window.Slots.Add(slot);
        }

        private bool HasExpectedSlotGrid(AvailabilityWindow window)
        {
            var bookedStarts = window.Slots
                .Where(slot => slot.Appointment != null)
                .Select(slot => slot.StartTime)
                .ToHashSet();
            var expected = GenerateSlots(window)
                .Where(slot => !bookedStarts.Contains(slot.StartTime))
                .OrderBy(slot => slot.StartTime)
                .ToList();
            var actual = window.Slots
                .Where(slot => slot.Appointment == null)
                .OrderBy(slot => slot.StartTime)
                .ToList();

            return expected.Count == actual.Count &&
                expected.Zip(actual).All(pair =>
                    pair.First.StartTime == pair.Second.StartTime &&
                    pair.First.EndTime == pair.Second.EndTime);
        }

        private static (TimeSpan Start, TimeSpan End) NormalizeTimes(
            bool isAvailable,
            string? startTime,
            string? endTime)
        {
            if (!isAvailable) return (TimeSpan.Zero, TimeSpan.Zero);
            var start = TimeSpan.FromHours(9);
            var end = TimeSpan.FromHours(17);
            if (!string.IsNullOrWhiteSpace(startTime) && !TimeSpan.TryParse(startTime, out start))
                throw new InvalidOperationException("Invalid start time");
            if (!string.IsNullOrWhiteSpace(endTime) && !TimeSpan.TryParse(endTime, out end))
                throw new InvalidOperationException("Invalid end time");
            if (start < TimeSpan.Zero || start >= TimeSpan.FromDays(1) ||
                end <= TimeSpan.Zero || end > TimeSpan.FromDays(1))
                throw new InvalidOperationException("Times must be within one day");
            if (end <= start) throw new InvalidOperationException("End time must be after start time");
            return (start, end);
        }

        private static DateTime ParseDate(string value) =>
            DateTime.TryParse(value, out var date)
                ? date.Date
                : throw new InvalidOperationException("Invalid date format");

        private static DateTime StartOfWeek(DateTime date) =>
            date.AddDays(-(((int)date.DayOfWeek + 6) % 7)).Date;

        private static int MondayFirst(int dayOfWeek) => (dayOfWeek + 6) % 7;

        private static void ApplyRuleToWindow(AvailabilityWindow window, WeeklyAvailabilityRule rule)
        {
            window.IsAvailable = rule.IsAvailable;
            window.StartTime = rule.StartTime;
            window.EndTime = rule.EndTime;
            window.Notes = rule.Notes;
        }

        private static WeeklyAvailabilityRuleDto MapWeeklyRuleToDto(WeeklyAvailabilityRule rule) => new()
        {
            DayOfWeek = rule.DayOfWeek,
            IsAvailable = rule.IsAvailable,
            StartTime = rule.IsAvailable ? rule.StartTime.ToString(@"hh\:mm") : null,
            EndTime = rule.IsAvailable ? rule.EndTime.ToString(@"hh\:mm") : null,
            Notes = rule.Notes,
        };

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

            if (window.IsAvailable)
            {
                // Slots represent possible start times, not fixed appointment
                // lengths. AppointmentService calculates each actual end time.
                var slotDuration = TimeSpan.FromMinutes(15);
                var currentTime = window.StartTime;

                while (currentTime < window.EndTime)
                {
                    var slotEnd = currentTime.Add(slotDuration);
                    if (slotEnd > window.EndTime) slotEnd = window.EndTime;

                    slots.Add(new Availability
                    {
                        PersonnelId = window.PersonnelId,
                        Date = window.Date,
                        StartTime = currentTime,
                        EndTime = slotEnd,
                        Notes = window.Notes,
                        AvailabilityWindowId = window.Id
                    });

                    currentTime = currentTime.Add(slotDuration);
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
                IsGeneratedFromWeeklySchedule = window.IsGeneratedFromWeeklySchedule,
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
                PersonnelId = appointment.Availability?.PersonnelId ?? string.Empty,
                PersonnelName = appointment.Availability?.Personnel?.FullName ?? string.Empty,
                Tasks = appointment.Tasks,
                StartTime = appointment.StartTime.ToString(@"hh\:mm"),
                EndTime = appointment.EndTime.ToString(@"hh\:mm"),
                Status = appointment.Status
            };
        }
    }
}
