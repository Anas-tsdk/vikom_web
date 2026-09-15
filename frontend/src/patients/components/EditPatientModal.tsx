import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { translateApiMessage } from '../../i18n';
import type { Medication, PatientDetailsDto } from '../types/patient';
import PatientService from '../services/PatientService';
import SupabaseProfileField, { type SupabaseLinkValue } from './SupabaseProfileField';
import AddressAutocomplete from './AddressAutocomplete';

// The link carries only the Supabase profile id. The display name is resolved
// from Supabase by SupabaseProfileField — deliberately NOT from patient.username,
// which is this patient's local URL handle and a different thing entirely.
const toLinkValue = (patient: PatientDetailsDto): SupabaseLinkValue | null =>
  patient.supabaseProfileId
    ? { supabaseProfileId: patient.supabaseProfileId, username: null }
    : null;

interface EditPatientModalProps {
  show: boolean;
  onHide: () => void;
  patient: PatientDetailsDto;
  onSaved: (updated: PatientDetailsDto) => void;
}

/**
 * Modal form for editing a patient's contact details
 * (name, email, phone, address).
 */
const EditPatientModal: React.FC<EditPatientModalProps> = ({ show, onHide, patient, onSaved }) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState<string>(patient.fullName);
  const [email, setEmail] = useState<string>(patient.email);
  const [phoneNumber, setPhoneNumber] = useState<string>(patient.phoneNumber);
  const [address, setAddress] = useState<string>(patient.address ?? '');
  const [latitude, setLatitude] = useState<number | null>(patient.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(patient.longitude ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(patient.clinical.dateOfBirth?.slice(0, 10) ?? '');
  const [nextOfKinName, setNextOfKinName] = useState(patient.clinical.nextOfKinName ?? '');
  const [nextOfKinRelation, setNextOfKinRelation] = useState(patient.clinical.nextOfKinRelation ?? '');
  const [generalPractitioner, setGeneralPractitioner] = useState(patient.clinical.generalPractitioner ?? '');
  const [allergies, setAllergies] = useState(patient.clinical.allergies ?? '');
  const [diagnoses, setDiagnoses] = useState(patient.clinical.diagnoses.join('\n'));
  const [conditionFlags, setConditionFlags] = useState(patient.clinical.conditionFlags.join('\n'));
  const [dailyTasks, setDailyTasks] = useState(patient.clinical.treatmentPlan ?? '');
  const [medications, setMedications] = useState<Medication[]>(patient.clinical.medications);
  const [supabaseLink, setSupabaseLink] = useState<SupabaseLinkValue | null>(toLinkValue(patient));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // React state updates after the current event. This synchronous guard also
  // blocks a rapid double-click before the disabled button has rendered.
  const savingRef = useRef(false);

  // Reset the form to the current patient whenever the modal is (re)opened.
  useEffect(() => {
    if (show) {
      setFullName(patient.fullName);
      setEmail(patient.email);
      setPhoneNumber(patient.phoneNumber);
      setAddress(patient.address ?? '');
      setLatitude(patient.latitude ?? null);
      setLongitude(patient.longitude ?? null);
      setDateOfBirth(patient.clinical.dateOfBirth?.slice(0, 10) ?? '');
      setNextOfKinName(patient.clinical.nextOfKinName ?? '');
      setNextOfKinRelation(patient.clinical.nextOfKinRelation ?? '');
      setGeneralPractitioner(patient.clinical.generalPractitioner ?? '');
      setAllergies(patient.clinical.allergies ?? '');
      setDiagnoses(patient.clinical.diagnoses.join('\n'));
      setConditionFlags(patient.clinical.conditionFlags.join('\n'));
      setDailyTasks(patient.clinical.treatmentPlan ?? '');
      setMedications(patient.clinical.medications.map((medication) => ({ ...medication })));
      setSupabaseLink(toLinkValue(patient));
      setError('');
    }
  }, [show, patient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (savingRef.current) return;

    if (!fullName.trim() || !email.trim()) {
      setError(t('Navn og e-post er påkrevd.'));
      return;
    }

    savingRef.current = true;
    try {
      setSaving(true);
      setError('');
      const updated = await PatientService.update(patient.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
        address: address.trim(),
        latitude,
        longitude,
        supabaseProfileId: supabaseLink?.supabaseProfileId ?? null,
        dateOfBirth: dateOfBirth || null,
        nextOfKinName: nextOfKinName.trim() || null,
        nextOfKinRelation: nextOfKinRelation.trim() || null,
        generalPractitioner: generalPractitioner.trim() || null,
        allergies: allergies.trim() || null,
        diagnoses: diagnoses.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
        conditionFlags: conditionFlags.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
        // Keep the established API property for backwards compatibility while
        // presenting the clearer patient-facing name throughout the UI.
        treatmentPlan: dailyTasks.trim() || null,
        medications: medications.map((medication) => ({
          name: medication.name.trim(),
          dosage: medication.dosage?.trim() || null,
          schedule: medication.schedule?.trim() || null,
        })).filter((medication) => medication.name),
      });
      onSaved(updated);
      onHide();
    } catch (err) {
      setError(translateApiMessage(t, err instanceof Error ? err.message : 'Kunne ikke lagre endringene. Prøv igjen.'));
      console.error(err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{t('Rediger pasientinformasjon')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form.Group className="mb-3" controlId="editPatientName">
            <Form.Label>{t('Fullt navn')}</Form.Label>
            <Form.Control
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="editPatientEmail">
            <Form.Label>{t('E-post')}</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="editPatientPhone">
            <Form.Label>{t('Telefon')}</Form.Label>
            <Form.Control
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </Form.Group>

          <AddressAutocomplete
            idPrefix="editPatient"
            value={address}
            onChange={(nextAddress, nextLatitude, nextLongitude) => {
              setAddress(nextAddress);
              setLatitude(nextLatitude);
              setLongitude(nextLongitude);
            }}
          />

          <SupabaseProfileField value={supabaseLink} onChange={setSupabaseLink} />

          <hr />
          <h5 className="mb-3">{t('Helseopplysninger')}</h5>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientDateOfBirth">
                <Form.Label>{t('Fødselsdato')}</Form.Label>
                <Form.Control type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientGp">
                <Form.Label>{t('Fastlege')}</Form.Label>
                <Form.Control value={generalPractitioner} onChange={(event) => setGeneralPractitioner(event.target.value)} />
              </Form.Group>
            </Col>
          </Row>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientEmergencyName">
                <Form.Label>{t('Pårørende')}</Form.Label>
                <Form.Control value={nextOfKinName} onChange={(event) => setNextOfKinName(event.target.value)} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientEmergencyRelation">
                <Form.Label>{t('Relasjon')}</Form.Label>
                <Form.Control value={nextOfKinRelation} onChange={(event) => setNextOfKinRelation(event.target.value)} placeholder={t('For eksempel datter eller ektefelle')} />
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-3" controlId="editPatientAllergies">
            <Form.Label>{t('Allergier')}</Form.Label>
            <Form.Control value={allergies} onChange={(event) => setAllergies(event.target.value)} />
          </Form.Group>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientDiagnoses">
                <Form.Label>{t('Diagnoser')}</Form.Label>
                <Form.Control as="textarea" rows={3} value={diagnoses} onChange={(event) => setDiagnoses(event.target.value)} placeholder={t('Én diagnose per linje')} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="editPatientConditionFlags">
                <Form.Label>{t('Tilstandsmerknader')}</Form.Label>
                <Form.Control as="textarea" rows={3} value={conditionFlags} onChange={(event) => setConditionFlags(event.target.value)} placeholder={t('Én merknad per linje')} />
              </Form.Group>
            </Col>
          </Row>
          <Form.Group className="mb-3" controlId="editPatientDailyTasks">
            <Form.Label>{t('Daglige gjøremål')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={dailyTasks}
              onChange={(event) => setDailyTasks(event.target.value)}
              placeholder={t('Én oppgave per linje')}
            />
          </Form.Group>

          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0">{t('Gjeldende medisinering')}</h6>
            <Button type="button" size="sm" variant="outline-primary" onClick={() => setMedications((current) => [...current, { name: '', dosage: '', schedule: '' }])}>
              <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>{t('Legg til medisin')}
            </Button>
          </div>
          {medications.length === 0 && <p className="text-muted small">{t('Ingen registrerte medisiner.')}</p>}
          {medications.map((medication, index) => (
            <Row key={index} className="g-2 mb-2 align-items-center">
              <Col md={4}>
                <Form.Control
                  aria-label={t('Medikamentnavn')}
                  placeholder={t('Medikamentnavn')}
                  value={medication.name}
                  onChange={(event) => setMedications((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                />
              </Col>
              <Col md={3}>
                <Form.Control
                  aria-label={t('Dose')}
                  placeholder={t('Dose')}
                  value={medication.dosage ?? ''}
                  onChange={(event) => setMedications((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dosage: event.target.value } : item))}
                />
              </Col>
              <Col md={4}>
                <Form.Control
                  aria-label={t('Tidspunkt og hyppighet')}
                  placeholder={t('Tidspunkt og hyppighet')}
                  value={medication.schedule ?? ''}
                  onChange={(event) => setMedications((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, schedule: event.target.value } : item))}
                />
              </Col>
              <Col md={1}>
                <Button type="button" variant="outline-danger" aria-label={t('Fjern medisin')} onClick={() => setMedications((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <i className="bi bi-trash" aria-hidden="true"></i>
                </Button>
              </Col>
            </Row>
          ))}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>
            {t('Avbryt')}
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {t('Lagrer...')}
              </>
            ) : (
              t('Lagre endringer')
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default EditPatientModal;
