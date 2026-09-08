import React from 'react';
import SectionCard from '../../components/common/SectionCard';

interface DiagnosesCardProps {
  diagnoses: string[];
  className?: string;
}

/** "Diagnoser" — bulleted list of diagnoses. */
const DiagnosesCard: React.FC<DiagnosesCardProps> = ({ diagnoses, className }) => {
  return (
    <SectionCard title="Diagnoser" icon="clipboard2-pulse" className={className}>
      {diagnoses.length === 0 ? (
        <p className="text-muted mb-0">Ingen registrerte diagnoser.</p>
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
