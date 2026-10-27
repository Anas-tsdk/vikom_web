import React from 'react';
import SectionCard from '../../components/common/SectionCard';
import InfoRow from '../../components/common/InfoRow';
import { useTranslation } from 'react-i18next';
import { localeForLanguage } from '../../i18n';
import type { PatientClinical } from '../types/patient';

interface ClinicalOverviewCardProps {
  clinical: PatientClinical;
  action?: React.ReactNode;
  className?: string;
}

const formatDob = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
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
const ClinicalOverviewCard: React.FC<ClinicalOverviewCardProps> = ({ clinical, action, className }) => {
  const { t, i18n } = useTranslation();
  const dob = formatDob(clinical.dateOfBirth, localeForLanguage(i18n.resolvedLanguage));
  const age = calcAge(clinical.dateOfBirth);
  const dobValue = dob ? (age != null ? t('{{date}} ({{age}} år)', { date: dob, age }) : dob) : undefined;
  const kin = clinical.nextOfKinName
    ? `${clinical.nextOfKinName}${clinical.nextOfKinRelation ? ` (${clinical.nextOfKinRelation})` : ''}`
    : undefined;

  return (
    <SectionCard title={t('Pasientoversikt')} icon="person" action={action} className={className}>
      <InfoRow icon="calendar-heart" label={t('Født')} value={dobValue} />
      <InfoRow icon="people" label={t('Pårørende')} value={kin} />
      <InfoRow icon="hospital" label={t('Fastlege')} value={clinical.generalPractitioner} />
      <InfoRow icon="exclamation-triangle" label={t('Allergier')} value={clinical.allergies} />
    </SectionCard>
  );
};

export default ClinicalOverviewCard;
