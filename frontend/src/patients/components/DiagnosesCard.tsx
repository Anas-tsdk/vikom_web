import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import { useTranslation } from 'react-i18next';

interface DiagnosesCardProps {
  diagnoses: string[];
  action?: React.ReactNode;
  className?: string;
}

/** "Diagnoser" — bulleted list of diagnoses. */
const DiagnosesCard: React.FC<DiagnosesCardProps> = ({ diagnoses, action, className }) => {
  const { t } = useTranslation();
  return (
    <SectionCard title={t('Diagnoser')} icon="clipboard2-pulse" action={action} className={className}>
      {diagnoses.length === 0 ? (
        <p className="text-muted mb-0">{t('Ingen registrerte diagnoser.')}</p>
      ) : (
        <ul className="mb-0 ps-3">
          {diagnoses.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
};

export default DiagnosesCard;
