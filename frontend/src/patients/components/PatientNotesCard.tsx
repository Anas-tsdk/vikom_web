import React, { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import SectionCard from '../../components/common/SectionCard';
import IconButton from '../../components/common/IconButton';
import PatientService from '../services/PatientService';
import { localeForLanguage } from '../../i18n';

interface PatientNotesCardProps {
  patientId: string;
  initialNotes?: string | null;
  notesUpdatedAt?: string | null;
  onSaved?: (notes: string) => void;
}

const formatUpdatedAt = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Editable free-text care note. Personnel can write/update a note that
 * persists via the patient notes endpoint.
 */
const PatientNotesCard: React.FC<PatientNotesCardProps> = ({
  patientId,
  initialNotes,
  notesUpdatedAt,
  onSaved,
}) => {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [savedNotes, setSavedNotes] = useState<string>(initialNotes ?? '');
  const [updatedAt, setUpdatedAt] = useState<string | null | undefined>(notesUpdatedAt);
  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const isDirty = notes !== savedNotes;

  const handleEdit = () => {
    setNotes(savedNotes);
    setError('');
    setShowEditor(true);
  };

  const handleSave = async () => {
    // Nothing changed — just leave edit mode without an API call.
    if (!isDirty) {
      setShowEditor(false);
      return;
    }

    try {
      setSaving(true);
      setError('');
      await PatientService.updateNotes(patientId, notes);
      setSavedNotes(notes);
      setUpdatedAt(new Date().toISOString());
      onSaved?.(notes);
      setShowEditor(false);
    } catch (err) {
      setError(t('Kunne ikke lagre notatet. Prøv igjen.'));
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(savedNotes);
    setError('');
    setShowEditor(false);
  };

  const action = <IconButton icon="pencil" title={t('Rediger')} onClick={handleEdit} />;

  return (
    <>
      <SectionCard title={t('Notater')} icon="journal-text" action={action}>
      {savedNotes ? (
        <p className="vk-notes-text mb-0">{savedNotes}</p>
      ) : (
        <p className="text-muted mb-0">{t('Ingen notater enda.')}</p>
      )}
      {updatedAt && (
        <div className="text-muted small mt-2">
          {t('Sist oppdatert: {{date}}', {
            date: formatUpdatedAt(updatedAt, localeForLanguage(i18n.resolvedLanguage)),
          })}
        </div>
      )}
      </SectionCard>
      <Modal show={showEditor} onHide={() => !saving && handleCancel()} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Rediger notater')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Control
            as="textarea"
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('Skriv et notat om pasienten (oppdateres jevnlig)...')}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleCancel} disabled={saving}>
            {t('Avbryt')}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('Lagrer...') : t('Lagre endringer')}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PatientNotesCard;
