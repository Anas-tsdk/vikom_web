import React from 'react';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../../auth/AuthService';
import PersonnelDashboard from '../components/PersonnelDashboard';
import { isPortalRole } from '../../auth/roles';

// dashboard wrapper - the portal only serves personnel
const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const userInfo = getUserInfo();

  if (isPortalRole(userInfo?.role)) {
    return <PersonnelDashboard />;
  }

  return (
    <div className="container mt-5">
      <p className="text-muted">{t('Kunne ikke laste dashbordet. Vennligst logg inn igjen.')}</p>
    </div>
  );
};

export default DashboardPage;
