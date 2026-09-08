import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import SectionCard from '../../components/common/SectionCard';
import IconButton from '../../components/common/IconButton';
import PatientService from '../services/PatientService';

interface PatientNotesCardProps {
  patientId: string;
  initialNotes?: string | null;
  notesUpdatedAt?: string | null;
  onSaved?: (notes: string) => void;
}

const formatUpdatedAt = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('nb-NO', {
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
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [savedNotes, setSavedNotes] = useState<string>(initialNotes ?? '');
  const [updatedAt, setUpdatedAt] = useState<string | null | undefined>(notesUpdatedAt);
  const [editing, setEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const isDirty = notes !== savedNotes;

  const handleEdit = () => {
    setNotes(savedNotes);
    setError('');
    setEditing(true);
  };

  const handleSave = async () => {
    // Nothing changed — just leave edit mode without an API call.
    if (!isDirty) {
      setEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError('');
      await PatientService.updateNotes(patientId, notes);
      setSavedNotes(notes);
      setUpdatedAt(new Date().toISOString());
      onSaved?.(notes);
      setEditing(false);
    } catch (err) {
      setError('Kunne ikke lagre notatet. Prøv igjen.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(savedNotes);
    setError('');
    setEditing(false);
  };

  const action = editing ? (
    <div className="d-flex gap-2">
      <IconButton icon="check-lg" title="Lagre" onClick={handleSave} loading={saving} />
      <IconButton icon="x-lg" title="Avbryt" onClick={handleCancel} disabled={saving} />
    </div>
  ) : (
    <IconButton icon="pencil" title="Rediger" onClick={handleEdit} />
  );

  return (
    <SectionCard title="Notater" icon="journal-text" action={action}>
      {editing ? (
        <>
          <Form.Control
            as="textarea"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Skriv et notat om pasienten (oppdateres jevnlig)..."
            autoFocus
          />
          {error && <div className="text-danger small mt-2">{error}</div>}
        </>
      ) : savedNotes ? (
        <p className="vk-notes-text mb-0">{savedNotes}</p>
      ) : (
        <p className="text-muted mb-0">Ingen notater enda.</p>
      )}
      {updatedAt && (
        <div className="text-muted small mt-2">
          Sist oppdatert: {formatUpdatedAt(updatedAt)}
        </div>
      )}
    </SectionCard>
  );
};

export default PatientNotesCard;
