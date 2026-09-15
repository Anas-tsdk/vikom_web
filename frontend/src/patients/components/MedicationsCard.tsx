import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import { useTranslation } from 'react-i18next';
import type { Medication } from '../types/patient';

interface MedicationsCardProps {
  medications: Medication[];
  className?: string;
}

/** "Gjeldende medisinering" — name + dosage on top, schedule beneath. */
const MedicationsCard: React.FC<MedicationsCardProps> = ({ medications, className }) => {
  const { t } = useTranslation();
  return (
    <SectionCard title={t('Gjeldende medisinering')} icon="capsule" className={className}>
      {medications.length === 0 ? (
        <p className="text-muted mb-0">{t('Ingen registrerte medisiner.')}</p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {medications.map((m, i) => (
            <div key={i}>
              <div className="fw-semibold">
                {m.name}
                {m.dosage ? ` ${m.dosage}` : ''}
              </div>
              {m.schedule && <div className="text-muted small">{m.schedule}</div>}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

export default MedicationsCard;
