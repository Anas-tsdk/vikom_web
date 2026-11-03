import React, { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import SectionCard from '../../components/common/SectionCard';
import Badge from '../../components/common/Badge';
import { useTranslation } from 'react-i18next';
import IconButton from '../../components/common/IconButton';
import PatientService from '../services/PatientService';

interface TreatmentPlanCardProps {
  patientId?: string;
  treatmentPlan?: string | null;
  conditionFlags: string[];
  canEdit?: boolean;
  onSaved?: (treatmentPlan: string | null) => void;
  className?: string;
}

/** Patient-facing daily tasks plus condition-flag tags. */
const TreatmentPlanCard: React.FC<TreatmentPlanCardProps> = ({
  patientId,
  treatmentPlan,
  conditionFlags,
  canEdit,
  onSaved,
  className,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(treatmentPlan ?? '');
  const [savedPlan, setSavedPlan] = useState(treatmentPlan ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) {
      const currentPlan = treatmentPlan ?? '';
      setDraft(currentPlan);
      setSavedPlan(currentPlan);
    }
  }, [editing, treatmentPlan]);

  const handleSave = async () => {
    if (draft === savedPlan) {
      setEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError('');
      const normalizedPlan = draft.trim();
      if (!patientId) return;
      await PatientService.updateTreatmentPlan(patientId, normalizedPlan);
      const updatedPlan = normalizedPlan || null;
      setSavedPlan(normalizedPlan);
      setDraft(normalizedPlan);
      onSaved?.(updatedPlan);
      setEditing(false);
    } catch (saveError) {
      setError(t('Kunne ikke lagre endringene. Prøv igjen.'));
      console.error(saveError);
    } finally {
      setSaving(false);
    }
  };

  const action = canEdit && patientId ? (
    editing ? (
      <div className="d-flex gap-2">
        <IconButton icon="check-lg" title={t('Lagre')} onClick={handleSave} loading={saving} />
        <IconButton
          icon="x-lg"
          title={t('Avbryt')}
          onClick={() => {
            setDraft(savedPlan);
            setError('');
            setEditing(false);
          }}
          disabled={saving}
        />
      </div>
    ) : (
      <IconButton
        icon="pencil"
        title={t('Rediger')}
        onClick={() => {
          setDraft(savedPlan);
          setError('');
          setEditing(true);
        }}
      />
    )
  ) : undefined;

  return (
    <SectionCard title={t('Daglige gjøremål')} icon="journal-medical" action={action} className={className}>
      {editing ? (
        <>
          <Form.Control
            as="textarea"
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          {error && <div className="text-danger small mt-2">{error}</div>}
        </>
      ) : savedPlan.trim() ? (
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{savedPlan}</p>
      ) : (
        <p className="text-muted mb-0">{t('Ingen daglige gjøremål registrert.')}</p>
      )}

      {conditionFlags.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mt-3">
          {conditionFlags.map((flag, i) => (
            <Badge key={i} bg="light" bordered>{flag}</Badge>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

export default TreatmentPlanCard;
