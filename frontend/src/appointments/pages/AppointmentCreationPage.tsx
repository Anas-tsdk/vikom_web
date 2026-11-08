import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppointmentForm from '../components/AppointmentForm';
import AppointmentService from '../services/AppointmentService';
import type { Appointment } from '../types/appointment';
import PageHeader from '../../components/common/PageHeader';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import { translateApiMessage } from '../../i18n';
import './AppointmentListPage.css';

const AppointmentCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userInfo = getUserInfo();
  const [error, setError] = useState('');

  if (!isHeadNurseRole(userInfo?.role)) {
    return <Navigate to="/appointments" replace />;
  }

  const handleSubmit = async (appointment: Appointment) => {
    try {
      setError('');
      await AppointmentService.create({
        patientId: appointment.patientId,
        availabilityId: appointment.availabilityId,
        tasks: appointment.tasks,
        additionalDurationMinutes: appointment.additionalDurationMinutes ?? 0,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
      });
      navigate('/appointments');
    } catch (submitError) {
      setError(translateApiMessage(
        t,
        submitError instanceof Error
          ? submitError.message
          : 'Kunne ikke sende inn avtalen. Vennligst prøv igjen.',
      ));
    }
  };

  return (
    <div className="appointment-list-page appointment-creation-page">
      <PageHeader
        title={t('Opprett avtale')}
        subtitle={t('Planlegg en avtale for en pasient.')}
      />
      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      <div className="appointment-create-tab">
        <AppointmentForm
          defaultPersonnelId={userInfo?.userId}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/appointments')}
        />
      </div>
    </div>
  );
};

export default AppointmentCreationPage;
