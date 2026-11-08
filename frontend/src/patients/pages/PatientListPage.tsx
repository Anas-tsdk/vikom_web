import React, { useCallback, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
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

const parseLastAppointmentDate = (value: string): number | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  if (
    date.getFullYear() !== Number(yearText) ||
    date.getMonth() !== Number(monthText) - 1 ||
    date.getDate() !== Number(dayText)
  ) return null;
  return date.getTime();
};

type PatientSort = 'name-asc' | 'name-desc' | 'appointments-desc' | 'appointments-asc' | 'last-visit-desc' | 'last-visit-asc';

const PatientListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const isHeadNurse = isHeadNurseRole(AuthService.getUserInfo()?.role);

  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<PatientSort>('name-asc');

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

  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const filteredPatients = patients
    .filter((patient) => {
      const query = search.trim().toLocaleLowerCase(locale);
      if (!query) return true;
      return [
        patient.fullName,
        patient.email,
        patient.phoneNumber,
        patient.address,
      ].some((value) => value?.toLocaleLowerCase(locale).includes(query));
    })
    .sort((a, b) => {
      const byName = collator.compare(a.fullName, b.fullName);
      if (sortBy === 'name-asc') return byName;
      if (sortBy === 'name-desc') return -byName;
      if (sortBy === 'appointments-desc') {
        return b.totalAppointments - a.totalAppointments || byName;
      }
      if (sortBy === 'appointments-asc') {
        return a.totalAppointments - b.totalAppointments || byName;
      }

      const dateA = parseLastAppointmentDate(a.lastAppointmentDate);
      const dateB = parseLastAppointmentDate(b.lastAppointmentDate);
      if ((dateA === null) !== (dateB === null)) {
        return dateA === null ? 1 : -1;
      }
      const timeA = dateA ?? 0;
      const timeB = dateB ?? 0;
      const dateOrder = sortBy === 'last-visit-desc' ? timeB - timeA : timeA - timeB;
      return dateOrder || byName;
    });

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

      <div className="patient-list-controls">
        <Form.Group>
          <Form.Label htmlFor="patient-search">{t('Søk pasienter')}</Form.Label>
          <Form.Control
            id="patient-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Søk etter navn, e-post, telefon eller adresse')}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label htmlFor="patient-sort">{t('Sorter etter')}</Form.Label>
          <Form.Select
            id="patient-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as PatientSort)}
          >
            <option value="name-asc">{t('Sort A-Z')}</option>
            <option value="name-desc">{t('Sort Z-A')}</option>
            <option value="appointments-desc">{t('Most appointments')}</option>
            <option value="appointments-asc">{t('Fewest appointments')}</option>
            <option value="last-visit-desc">{t('Latest appointment first')}</option>
            <option value="last-visit-asc">{t('Oldest appointment first')}</option>
          </Form.Select>
        </Form.Group>
        <div className="patient-list-count" aria-live="polite">
          {t('Viser {{shown}} av {{total}} pasienter', {
            shown: filteredPatients.length,
            total: patients.length,
          })}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredPatients}
        rowKey={(patient) => patient.id}
        onRowClick={(patient) => navigate(`/patients/${encodeURIComponent(patient.username ?? patient.id)}`)}
        emptyIcon="people"
        emptyText={search ? t('Ingen pasienter samsvarer med søket.') : t('Ingen pasienter funnet.')}
      />
    </div>
  );
};

export default PatientListPage;
