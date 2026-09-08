import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import Badge from '../../components/common/Badge';

interface TreatmentPlanCardProps {
  treatmentPlan?: string | null;
  conditionFlags: string[];
  className?: string;
}

/** "Behandlingsplan" — free-text plan plus condition-flag tags. */
const TreatmentPlanCard: React.FC<TreatmentPlanCardProps> = ({
  treatmentPlan,
  conditionFlags,
  className,
}) => {
  return (
    <SectionCard title="Behandlingsplan" icon="journal-medical" className={className}>
      {treatmentPlan?.trim() ? (
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{treatmentPlan}</p>
      ) : (
        <p className="text-muted mb-0">Ingen behandlingsplan registrert.</p>
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
