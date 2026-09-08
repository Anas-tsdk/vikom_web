// Availability model based on backend.DTOs.AvailabilityDto
export interface Availability {
  id?: number;
  personnelId: string;
  personnelName?: string;
  date: string; // ISO date string
  startTime: string; // TimeSpan represented as string "HH:mm:ss" or "HH:mm"
  endTime: string;
  notes?: string;
  isBooked?: boolean;
}

// Availability create/update DTO
export interface AvailabilityDto {
  personnelId?: string;
  personnelName?: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

// Availability summary for dashboard display
export interface AvailabilitySummary {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  isBooked: boolean;
}

// ============ NEW WINDOW-BASED TYPES ============

// Availability Slot (part of a window)
export interface AvailabilitySlot {
  id: number;
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

// Availability Window
export interface AvailabilityWindow {
  id?: number;
  personnelId: string;
  personnelName?: string;
  date: string; // ISO date string
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  notes?: string;
  isAvailable: boolean;
  slots?: AvailabilitySlot[];
}

// Create Availability Window DTO
export interface CreateAvailabilityWindowDto {
  date: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  isAvailable: boolean;
}

// Update Availability Window DTO
export interface UpdateAvailabilityWindowDto {
  date: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  isAvailable: boolean;
}

// Day Availability (single day view)
// Note: Uses AppointmentSummary from appointment.ts to avoid duplication
export interface DayAvailability {
  date: string;
  status: 'Free' | 'Available' | 'Unavailable';
  windows: AvailabilityWindow[];
  appointments: Array<{
    id: number;
    patientName: string;
    startTime: string;
    endTime: string;
    status: string;
    tasks: string;
  }>;
}

// Week Availability (7-day view)
export interface WeekAvailability {
  startDate: string;
  endDate: string;
  days: DayAvailability[];
}
