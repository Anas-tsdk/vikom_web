// Central export for all services
export * as AuthService from '../auth/AuthService';
export { default as AppointmentService } from '../appointments/services/AppointmentService';
export * as AvailabilityService from '../availability/services/AvailabilityService';
export { default as PatientService } from '../patients/services/PatientService';
export * as DashboardService from '../dashboard/services/DashboardService';
export { signalingService } from './SupabaseSignalingService';
