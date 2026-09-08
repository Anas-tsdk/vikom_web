import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Spinner } from 'react-bootstrap';
import PatientService from '../services/PatientService';
import type { PatientListDto } from '../types/patient';
import CreatePatientModal from '../components/CreatePatientModal';
import DataTable, { type DataTableColumn } from '../../components/common/DataTable';
import PageHeader from '../../components/common/PageHeader';
import './PatientListPage.css';

const PatientListPage: React.FC = () => {
  const navigate = useNavigate();

  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showCreate, setShowCreate] = useState<boolean>(false);

  const loadPatients = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await PatientService.getAll();
      setPatients(data);
    } catch (err) {
      setError('Kunne ikke laste pasienter');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const columns: DataTableColumn<PatientListDto>[] = [
    {
      key: 'fullName',
      header: 'Navn',
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
    { key: 'email', header: 'E-post' },
    { key: 'phoneNumber', header: 'Telefon' },
    {
      key: 'address',
      header: 'Adresse',
      style: { minWidth: '180px' },
      render: (patient) => patient.address || 'Ikke oppgitt',
    },
    { key: 'totalAppointments', header: 'Totalt avtaler', style: { width: '150px' } },
    {
      key: 'lastAppointmentDate',
      header: 'Siste avtaledato',
      render: (patient) => patient.lastAppointmentDate || 'N/A',
    },
  ];

  if (loading) {
    return (
      <div className="patient-list-page">
        <div className="d-flex align-items-center gap-2 py-4">
          <Spinner animation="border" size="sm" />
          <span>Laster pasienter...</span>
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
        title="Pasienter"
        subtitle="Se og administrer alle pasientene dine."
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <i className="bi bi-person-plus me-2" aria-hidden="true"></i>
            Ny pasient
          </Button>
        }
      />

      <CreatePatientModal
        show={showCreate}
        onHide={() => setShowCreate(false)}
        onCreated={(created) => navigate(`/patients/${encodeURIComponent(created.username ?? created.id)}`)}
      />

      <DataTable
        columns={columns}
        data={patients}
        rowKey={(patient) => patient.id}
        onRowClick={(patient) => navigate(`/patients/${encodeURIComponent(patient.username ?? patient.id)}`)}
        emptyIcon="people"
        emptyText="Ingen pasienter funnet."
      />
    </div>
  );
};

export default PatientListPage;
