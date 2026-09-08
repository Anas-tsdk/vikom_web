import type { AppointmentSummary } from '../../appointments/types/appointment';
import type { AvailabilitySummary } from '../../availability/types/availability';

// Personnel dashboard view model
export interface PersonnelViewModel {
  personnelId: string;
  personnelName: string;
  totalPatients: number;
  appointmentsThisWeek: number;
  pendingAppointments: number;
  cancelledAppointments: number;
  upcomingAppointments: AppointmentSummary[];
  recentAppointments: AppointmentSummary[];
  upcomingAvailability: AvailabilitySummary[];
}
