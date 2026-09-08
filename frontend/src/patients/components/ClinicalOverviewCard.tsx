import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import InfoRow from '../../components/common/InfoRow';
import type { PatientClinical } from '../types/patient';

interface ClinicalOverviewCardProps {
  clinical: PatientClinical;
  className?: string;
}

const formatDob = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const calcAge = (iso?: string | null): number | null => {
  if (!iso) return null;
  const dob = new Date(iso);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
};

/** "Pasientoversikt" — DOB + age, next of kin, GP, allergies. */
const ClinicalOverviewCard: React.FC<ClinicalOverviewCardProps> = ({ clinical, className }) => {
  const dob = formatDob(clinical.dateOfBirth);
  const age = calcAge(clinical.dateOfBirth);
  const dobValue = dob ? (age != null ? `${dob} (${age} år)` : dob) : undefined;
  const kin = clinical.nextOfKinName
    ? `${clinical.nextOfKinName}${clinical.nextOfKinRelation ? ` (${clinical.nextOfKinRelation})` : ''}`
    : undefined;

  return (
    <SectionCard title="Pasientoversikt" icon="person" className={className}>
      <InfoRow icon="calendar-heart" label="Født" value={dobValue} />
      <InfoRow icon="people" label="Pårørende" value={kin} />
      <InfoRow icon="hospital" label="Fastlege" value={clinical.generalPractitioner} />
      <InfoRow icon="exclamation-triangle" label="Allergier" value={clinical.allergies} />
    </SectionCard>
  );
};

export default ClinicalOverviewCard;
