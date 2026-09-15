import React, { useCallback, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import PatientService from '../services/PatientService';
import type { PatientListDto } from '../types/patient';
import CreatePatientModal from '../components/CreatePatientModal';
import DataTable, { type DataTableColumn } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import { localeForLanguage } from '../../i18n';
import * as AuthService from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import './PatientListPage.css';

const formatDate = (value: string | null | undefined, locale: string): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
};

const PatientListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const isHeadNurse = isHeadNurseRole(AuthService.getUserInfo()?.role);

  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showCreate, setShowCreate] = useState<boolean>(false);

  const loadPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await PatientService.getAll();
      setPatients(data);
    } catch (err) {
      setError(t('Kunne ikke laste pasienter'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const columns: DataTableColumn<PatientListDto>[] = [
    {
      key: 'fullName',
      header: t('Navn'),
      style: { minWidth: '160px' },
      render: (patient) => (
        <Link
          to={`/patients/${encodeURIComponent(patient.username ?? patient.id)}`}
          className="fw-semibold text-dark text-decoration-none"
          onClick={(e) => e.stopPropagation()}
        >
          {patient.fullName}
        </Link>
      ),
    },
    { key: 'email', header: t('E-post') },
    { key: 'phoneNumber', header: t('Telefon') },
    {
      key: 'address',
      header: t('Adresse'),
      style: { minWidth: '180px' },
      render: (patient) => patient.address || t('Ikke oppgitt'),
    },
    { key: 'totalAppointments', header: t('Totalt avtaler'), style: { width: '150px' } },
    {
      key: 'lastAppointmentDate',
      header: t('Siste avtaledato'),
      render: (patient) => formatDate(patient.lastAppointmentDate, locale) || t('Aldri'),
    },
  ];

  if (loading) {
    return (
      <div className="patient-list-page">
        <div className="d-flex align-items-center gap-2 py-4">
          <Spinner animation="border" size="sm" />
          <span>{t('Laster pasienter...')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-list-page">
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <PageHeader
        title={t('Pasienter')}
        subtitle={t('Se og administrer alle pasientene dine.')}
        actions={isHeadNurse ? (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <i className="bi bi-person-plus me-2" aria-hidden="true"></i>
            {t('Ny pasient')}
          </Button>
        ) : undefined}
      />

      {isHeadNurse && (
        <CreatePatientModal
          show={showCreate}
          onHide={() => setShowCreate(false)}
          onCreated={(created) => navigate(`/patients/${encodeURIComponent(created.username ?? created.id)}`)}
        />
      )}

      <DataTable
        columns={columns}
        data={patients}
        rowKey={(patient) => patient.id}
        onRowClick={(patient) => navigate(`/patients/${encodeURIComponent(patient.username ?? patient.id)}`)}
        emptyIcon="people"
        emptyText={t('Ingen pasienter funnet.')}
      />
    </div>
  );
};

export default PatientListPage;
