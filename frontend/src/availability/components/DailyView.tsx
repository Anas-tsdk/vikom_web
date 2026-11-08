import React from 'react';
import { Table, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { DayAvailability, AvailabilityWindow } from '../types/availability';
import { formatTime12Hour } from '../../utils/dateUtils';
import TaskBadges from '../../components/common/TaskBadges';
import StatusBadge from '../../components/common/StatusBadge';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';

interface DailyViewProps {
  dayData: DayAvailability;
  onEdit: (window: AvailabilityWindow) => void;
  onDelete: (windowId: number) => void;
  onCreate: () => void;
  readOnly?: boolean;
}

const DailyView: React.FC<DailyViewProps> = ({
  dayData,
  onEdit,
  onDelete,
  onCreate,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  return (
    <div>
      {/* Availability Windows Section */}
      {dayData.windows.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-3">{t('Availability')}</h3>
          <div className="card border-1 border-dark bg-white overflow-hidden">
            <div className="card-body p-0">
              <Table hover className="mb-0 availability-detail-table">
                <thead className="table-light">
                  <tr>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Time Range')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Status')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Slots')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Notes')}</th>
                    {!readOnly && (
                      <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dayData.windows.map((window) => (
                    <React.Fragment key={window.id}>
                      <tr>
                        <td className="py-3 px-4 text-dark">
                          {formatTime12Hour(window.startTime)} - {formatTime12Hour(window.endTime)}
                        </td>
                        <td className="py-3 px-4 text-dark">
                          <Badge bg={window.isAvailable ? 'success' : 'danger'}>
                            {window.isAvailable ? t('Available') : t('Unavailable')}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-dark">
                          {window.slots && window.slots.length > 0 ? (
                            <div className="small">
                              {t('{{booked}} booked / {{total}} total', {
                                booked: window.slots.filter(s => s.isBooked).length,
                                total: window.slots.length,
                              })}
                            </div>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-dark">
                          {window.notes || <span className="text-muted">-</span>}
                        </td>
                        {!readOnly && (
                          <td className="py-3 px-4 text-dark">
                            <div className="d-flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onEdit(window)}
                              >
                                <i className="bi bi-pencil me-1"></i>{t('Edit')}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => window.id && onDelete(window.id)}
                                disabled={window.slots?.some(s => s.isBooked)}
                              >
                                <i className="bi bi-trash me-1"></i>{t('Delete')}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {/* Show slots if any are booked */}
                      {window.slots && window.slots.some(s => s.isBooked) && (
                        <tr className="bg-light">
                          <td colSpan={readOnly ? 4 : 5} className="py-2 px-4">
                            <div className="small ps-4">
                              <strong>{t('Booked Slots:')}</strong>
                              {window.slots
                                .filter(s => s.isBooked)
                                .map((slot, idx) => (
                                  <span key={slot.id} className="ms-2 text-muted">
                                    {formatTime12Hour(slot.startTime)} - {formatTime12Hour(slot.endTime)}
                                    {idx < window.slots!.filter(s => s.isBooked).length - 1 ? ',' : ''}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Appointments Section */}
      {dayData.appointments.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-3">{t('Appointments')}</h3>
          <div className="card border-1 border-dark bg-white overflow-hidden">
            <div className="card-body p-0">
              <Table hover className="mb-0 availability-detail-table">
                <thead className="table-light">
                  <tr>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Time')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Patient')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Task(s)')}</th>
                    <th className="fw-bold text-dark py-3 px-4 border-bottom border-dark">{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData.appointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="py-3 px-4 text-dark">
                        {formatTime12Hour(appointment.startTime)} - {formatTime12Hour(appointment.endTime)}
                      </td>
                      <td className="py-3 px-4 text-dark">{appointment.patientName}</td>
                      <td className="py-3 px-4 text-dark">
                        <TaskBadges tasks={appointment.tasks} variant="secondary" />
                      </td>
                      <td className="py-3 px-4 text-dark">
                        <StatusBadge status={appointment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {dayData.windows.length === 0 && dayData.appointments.length === 0 && (
        <EmptyState
          icon="calendar-x"
          text={t('You have no availability windows or appointments scheduled for this day.')}
          action={!readOnly ? (
            <button className="btn btn-primary" onClick={onCreate}>
              <i className="bi bi-calendar-plus me-2"></i>{t('Create Availability Window')}
            </button>
          ) : undefined}
        />
      )}
    </div>
  );
};

export default DailyView;
