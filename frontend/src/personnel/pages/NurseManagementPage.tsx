import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import PersonnelService, {
  type CreateNurseRequest,
  type NurseSummary,
} from '../services/PersonnelService';
import './NurseManagementPage.css';

type NurseForm = CreateNurseRequest & { confirmPassword: string };

const emptyForm: NurseForm = {
  userName: '',
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  role: 'Nurse',
  phoneNumber: '',
  address: '',
};

const NurseManagementPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const userInfo = getUserInfo();
  const authorized = isHeadNurseRole(userInfo?.role);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<NurseForm>(emptyForm);

  const loadNurses = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setNurses(await PersonnelService.getAll());
    } catch {
      setError(t('Kunne ikke laste sykepleiere'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authorized) void loadNurses();
    else setLoading(false);
  }, [authorized, loadNurses]);

  const sortedNurses = useMemo(() => [...nurses].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, i18n.resolvedLanguage)), [i18n.resolvedLanguage, nurses]);

  if (!authorized) return <Navigate to="/dashboard" replace />;

  const closeCreate = () => {
    if (saving) return;
    setShowCreate(false);
    setForm(emptyForm);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirmPassword) {
      setError(t('Passordene stemmer ikke overens'));
      return;
    }
    if (form.password.length < 8 || !/[a-z]/.test(form.password)
      || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
      setError(t('Passordet må ha minst 8 tegn, stor og liten bokstav og ett tall.'));
      return;
    }

    try {
      setSaving(true);
      const request: CreateNurseRequest = {
        userName: form.userName,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        phoneNumber: form.phoneNumber,
        address: form.address,
      };
      await PersonnelService.create(request);
      setShowCreate(false);
      setForm(emptyForm);
      setSuccess(t('Sykepleieren ble registrert.'));
      await loadNurses();
    } catch (requestError) {
      setError(t(requestError instanceof Error ? requestError.message : 'Kunne ikke registrere sykepleieren'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  return (
    <div className="nurse-management-page personnel-page">
      <PageHeader
        title={t('Sykepleiere')}
        subtitle={t('Administrer sykepleierkontoer og tilgangsnivåer.')}
        actions={(
          <Button onClick={() => { setError(''); setSuccess(''); setShowCreate(true); }}>
            <i className="bi bi-person-plus me-2" aria-hidden="true"></i>{t('Registrer sykepleier')}
          </Button>
        )}
      />

      {error && !showCreate && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {loading ? (
        <div className="nurse-loading"><Spinner animation="border" /><span>{t('Laster...')}</span></div>
      ) : sortedNurses.length === 0 ? (
        <EmptyState icon="people" text={t('Ingen sykepleiere registrert.')} />
      ) : (
        <div className="nurse-grid">
          {sortedNurses.map((nurse) => (
            <Link
              className="nurse-card"
              key={nurse.id}
              to={`/availability?personnelId=${encodeURIComponent(nurse.id)}`}
              aria-label={t('Administrer tilgjengeligheten til {{name}}.', { name: nurse.fullName })}
            >
              <span className="nurse-avatar" aria-hidden="true"><i className="bi bi-person"></i></span>
              <div className="nurse-card__body">
                <div className="nurse-card__heading">
                  <h2>{nurse.fullName}</h2>
                  <span className={`nurse-role nurse-role--${nurse.role === 'HeadNurse' ? 'head' : 'normal'}`}>
                    {nurse.role === 'HeadNurse' ? t('Ledende sykepleier') : t('Sykepleier')}
                  </span>
                </div>
                <span><i className="bi bi-envelope me-2" aria-hidden="true"></i>{nurse.email}</span>
                {nurse.phoneNumber && <span><i className="bi bi-telephone me-2" aria-hidden="true"></i>{nurse.phoneNumber}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal show={showCreate} onHide={closeCreate} centered>
        <Form onSubmit={submit}>
          <Modal.Header closeButton>
            <Modal.Title>{t('Registrer sykepleier')}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted">{t('Registrer en ny sykepleierkonto.')}</p>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3" controlId="nurse-full-name">
              <Form.Label>{t('Fullt navn')}</Form.Label>
              <Form.Control name="fullName" value={form.fullName} onChange={updateField} required disabled={saving} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="nurse-email">
              <Form.Label>{t('E-post')}</Form.Label>
              <Form.Control type="email" name="email" value={form.email} onChange={updateField} required disabled={saving} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="nurse-username">
              <Form.Label>{t('Brukernavn')}</Form.Label>
              <Form.Control name="userName" value={form.userName} onChange={updateField} required disabled={saving} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="nurse-role">
              <Form.Label>{t('Rolle')}</Form.Label>
              <Form.Select name="role" value={form.role} onChange={updateField} disabled={saving}>
                <option value="Nurse">{t('Sykepleier')} · {t('Jobber med sin egen plan')}</option>
                <option value="HeadNurse">{t('Ledende sykepleier')} · {t('Kan planlegge for alle sykepleiere')}</option>
              </Form.Select>
            </Form.Group>
            <div className="nurse-form-row">
              <Form.Group controlId="nurse-phone">
                <Form.Label>{t('Telefonnummer (valgfritt)')}</Form.Label>
                <Form.Control name="phoneNumber" value={form.phoneNumber} onChange={updateField} disabled={saving} />
              </Form.Group>
              <Form.Group controlId="nurse-address">
                <Form.Label>{t('Adresse (valgfritt)')}</Form.Label>
                <Form.Control name="address" value={form.address} onChange={updateField} disabled={saving} />
              </Form.Group>
            </div>
            <div className="nurse-form-row mt-3">
              <Form.Group controlId="nurse-password">
                <Form.Label>{t('Passord')}</Form.Label>
                <Form.Control type="password" name="password" value={form.password} onChange={updateField} required disabled={saving} />
              </Form.Group>
              <Form.Group controlId="nurse-confirm-password">
                <Form.Label>{t('Bekreft passord')}</Form.Label>
                <Form.Control type="password" name="confirmPassword" value={form.confirmPassword} onChange={updateField} required disabled={saving} />
              </Form.Group>
            </div>
            <Form.Text>{t('Passordet må ha minst 8 tegn, stor og liten bokstav og ett tall.')}</Form.Text>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeCreate} disabled={saving}>{t('Avbryt')}</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner animation="border" size="sm" className="me-2" />}{t('Opprett konto')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default NurseManagementPage;
