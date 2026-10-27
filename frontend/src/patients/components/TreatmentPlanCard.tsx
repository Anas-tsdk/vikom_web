import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import Badge from '../../components/common/Badge';
import { useTranslation } from 'react-i18next';

interface TreatmentPlanCardProps {
  treatmentPlan?: string | null;
  conditionFlags: string[];
  action?: React.ReactNode;
  className?: string;
}

/** Patient-facing daily tasks plus condition-flag tags. */
const TreatmentPlanCard: React.FC<TreatmentPlanCardProps> = ({
  treatmentPlan,
  conditionFlags,
  action,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <SectionCard title={t('Daglige gjøremål')} icon="journal-medical" action={action} className={className}>
      {treatmentPlan?.trim() ? (
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{treatmentPlan}</p>
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
