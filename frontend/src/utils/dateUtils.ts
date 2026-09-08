// Date and week utility functions for Availability Calendar

/**
 * Gets the Monday of the week containing the given date
 */
export function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(date.getFullYear(), date.getMonth(), diff);
}

/**
 * Gets the Sunday of the week containing the given date
 */
export function getSunday(date: Date): Date {
  const monday = getMonday(date);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
}

/**
 * Formats a date to YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date to readable format like "Monday, Dec 4, 2025"
 */
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString('nb-NO', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date to short format like "Dec 4"
 */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('nb-NO', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Gets the day name (Sun, Mon, Tue, etc.)
 */
export function getDayName(date: Date): string {
  return date.toLocaleDateString('nb-NO', { weekday: 'short' });
}

/**
 * Gets the day number
 */
export function getDayNumber(date: Date): number {
  return date.getDate();
}

/**
 * Checks if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Checks if a date is today
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Parses ISO date string to Date object
 */
export function parseISODate(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}

/**
 * Adds days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Adds weeks to a date
 */
export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/**
 * Formats week range like "Nov 30 - Dec 6, 2025"
 */
export function formatWeekRange(startDate: Date, endDate: Date): string {
  const startMonth = startDate.toLocaleDateString('nb-NO', { month: 'short' });
  const startDay = startDate.getDate();
  const endMonth = endDate.toLocaleDateString('nb-NO', { month: 'short' });
  const endDay = endDate.getDate();
  const year = endDate.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Generates array of 7 dates for a week starting from Monday
 */
export function getWeekDates(monday: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(monday, i));
  }
  return dates;
}

/**
 * Formats time from HH:mm to 24-hour format (e.g., "09:00")
 */
export function formatTime12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Generates hour options for dropdown (00:00 to 23:00)
 */
export function generateHourOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const value = `${String(hour).padStart(2, '0')}:00`;
    const label = formatTime12Hour(value);
    options.push({ value, label });
  }
  return options;
}
