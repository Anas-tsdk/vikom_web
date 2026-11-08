import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
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
  canEditConditionFlags?: boolean;
  onEditConditionFlags?: () => void;
  onSaved?: (treatmentPlan: string | null) => void;
  className?: string;
}

/** Patient-facing daily tasks plus condition-flag tags. */
const TreatmentPlanCard: React.FC<TreatmentPlanCardProps> = ({
  patientId,
  treatmentPlan,
  conditionFlags,
  canEdit,
  canEditConditionFlags,
  onEditConditionFlags,
  onSaved,
  className,
}) => {
  const { t } = useTranslation();
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState(treatmentPlan ?? '');
  const [savedPlan, setSavedPlan] = useState(treatmentPlan ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!showEditor) {
      const currentPlan = treatmentPlan ?? '';
      setDraft(currentPlan);
      setSavedPlan(currentPlan);
    }
  }, [showEditor, treatmentPlan]);

  const handleSave = async () => {
    if (draft === savedPlan) {
      setShowEditor(false);
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
      setShowEditor(false);
    } catch (saveError) {
      setError(t('Kunne ikke lagre endringene. Prøv igjen.'));
      console.error(saveError);
    } finally {
      setSaving(false);
    }
  };

  const action = (canEdit && patientId) || canEditConditionFlags ? (
    <div className="d-flex gap-2">
      {canEdit && patientId && (
        <IconButton
          icon="pencil"
          title={t('Rediger daglige gjøremål')}
          onClick={() => {
            setDraft(savedPlan);
            setError('');
            setShowEditor(true);
          }}
        />
      )}
      {canEditConditionFlags && onEditConditionFlags && (
        <IconButton
          icon="pencil"
          title={t('Rediger tilstandsmerknader')}
          onClick={onEditConditionFlags}
        />
      )}
    </div>
  ) : undefined;

  return (
    <SectionCard title={t('Daglige gjøremål')} icon="journal-medical" action={action} className={className}>
      {savedPlan.trim() ? (
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
      <Modal show={showEditor} onHide={() => !saving && setShowEditor(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Rediger daglige gjøremål')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Control
            as="textarea"
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => {
              setDraft(savedPlan);
              setError('');
              setShowEditor(false);
            }}
            disabled={saving}
          >
            {t('Avbryt')}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('Lagrer...') : t('Lagre endringer')}
          </Button>
        </Modal.Footer>
      </Modal>
    </SectionCard>
  );
};

export default TreatmentPlanCard;
