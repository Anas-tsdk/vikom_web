import type { Appointment } from '../types/appointment';
import type { PatientListDto } from '../../patients/types/patient';
import type { AvailabilitySlot, DayAvailability } from '../../availability/types/availability';

export interface RecommendedSlot extends AvailabilitySlot {
  date: string;
  distanceScore: number;
}

const TASK_DURATIONS: Record<string, number> = {
  medisin: 5,
  medication: 5,
  bading: 25,
  bathing: 25,
  matlaging: 10,
  cooking: 10,
  'servering av måltider': 10,
  'serving meals': 10,
  husholdning: 25,
  housekeeping: 25,
  'digital hjelp': 15,
  'digital assistance': 15,
};

const VISIT_BUFFER_MINUTES = 10;
const FALLBACK_TRAVEL_MINUTES = 25;

export function getTaskDurationMinutes(task: string): number {
  return TASK_DURATIONS[task.trim().toLocaleLowerCase()] ?? 0;
}

export function calculateVisitDurationMinutes(
  tasks: string[],
  additionalMinutes: number,
): number {
  const uniqueTasks = new Set(tasks.map((task) => task.trim().toLocaleLowerCase()));
  const taskMinutes = [...uniqueTasks].reduce(
    (total, task) => total + getTaskDurationMinutes(task),
    0,
  );
  return VISIT_BUFFER_MINUTES + taskMinutes + additionalMinutes;
}

export function recommendSlots(
  days: DayAvailability[],
  nurseAppointments: Appointment[],
  patientAppointments: Appointment[],
  patient: PatientListDto | undefined,
  tasks: string[],
  additionalMinutes: number,
  now: Date,
  currentAppointment?: Appointment,
  declinedAppointment?: Appointment,
): RecommendedSlot[] {
  const durationMinutes = calculateVisitDurationMinutes(tasks, additionalMinutes);
  const patientPoint = {
    latitude: patient?.latitude ?? null,
    longitude: patient?.longitude ?? null,
  };
  const candidates: RecommendedSlot[] = [];

  for (const day of days) {
    const scheduled = nurseAppointments
      .filter((appointment) =>
        appointment.date === day.date &&
        appointment.id !== currentAppointment?.id &&
        appointment.status !== 'Cancelled',
      )
      .map((appointment) => ({
        appointment,
        start: toMinutes(appointment.startTime),
        end: toMinutes(appointment.endTime),
        point: {
          latitude: appointment.patientLatitude ?? null,
          longitude: appointment.patientLongitude ?? null,
        },
      }))
      .filter((appointment) => appointment.start !== null && appointment.end !== null)
      .sort((left, right) => left.start! - right.start!);

    for (const window of day.windows) {
      if (!window.isAvailable || !window.slots) continue;
      const windowEnd = toMinutes(window.endTime);
      if (windowEnd === null) continue;

      for (const slot of window.slots) {
        const isCurrentSlot =
          currentAppointment?.date === day.date &&
          currentAppointment.availabilityId === slot.id;
        if (slot.isBooked && !isCurrentSlot) continue;

        const start = toMinutes(slot.startTime);
        if (start === null || start + durationMinutes > windowEnd) continue;
        if (slotTimestamp(day.date, slot.startTime) <= now.getTime()) continue;

        const end = start + durationMinutes;
        const declinedStart = declinedAppointment?.declinedSlotStartTime;
        const declinedEnd = declinedAppointment?.declinedSlotEndTime;
        if (
          declinedAppointment?.declinedSlotDate === day.date &&
          declinedStart &&
          declinedEnd &&
          start < toMinutes(declinedEnd)! &&
          toMinutes(declinedStart)! < end
        ) continue;

        if (scheduled.some((visit) => visit.start! < end && start < visit.end!)) continue;
        const patientHasOverlap = patientAppointments.some((appointment) =>
          appointment.date === day.date &&
          appointment.id !== declinedAppointment?.id &&
          appointment.status !== 'Cancelled' &&
          toMinutes(appointment.startTime) !== null &&
          toMinutes(appointment.endTime) !== null &&
          toMinutes(appointment.startTime)! < end &&
          start < toMinutes(appointment.endTime)!,
        );
        if (patientHasOverlap) continue;

        const previous = [...scheduled].reverse().find((visit) => visit.end! <= start);
        const next = scheduled.find((visit) => visit.start! >= end);
        if (previous && start - previous.end! < estimateTravelMinutes(previous.point, patientPoint)) continue;
        if (next && next.start! - end < estimateTravelMinutes(patientPoint, next.point)) continue;

        const distanceScore =
          (previous ? distanceKm(previous.point, patientPoint) ?? 1000 : 0) +
          (next ? distanceKm(patientPoint, next.point) ?? 1000 : 0);
        candidates.push({
          ...slot,
          date: day.date,
          endTime: fromMinutes(end),
          distanceScore: previous || next ? distanceScore : 5000,
        });
      }
    }
  }

  return candidates.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.distanceScore - right.distanceScore,
  );
}

function estimateTravelMinutes(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number | null; longitude: number | null },
): number {
  const distance = distanceKm(from, to);
  if (distance === null) return FALLBACK_TRAVEL_MINUTES;

  const estimatedDrivingMinutes = distance * 1.35 / 30 * 60;
  return Math.ceil(estimatedDrivingMinutes * 1.25 + 5);
}

function distanceKm(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number | null; longitude: number | null },
): number | null {
  if (
    from.latitude === null || from.longitude === null ||
    to.latitude === null || to.longitude === null ||
    !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude) ||
    !Number.isFinite(to.latitude) || !Number.isFinite(to.longitude) ||
    Math.abs(from.latitude) > 90 || Math.abs(to.latitude) > 90 ||
    Math.abs(from.longitude) > 180 || Math.abs(to.longitude) > 180
  ) return null;

  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function toMinutes(time: string): number | null {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function fromMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function slotTimestamp(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}
