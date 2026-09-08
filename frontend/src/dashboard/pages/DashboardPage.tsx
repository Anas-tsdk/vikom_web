import React from 'react';
import { getUserInfo } from '../../auth/AuthService';
import PersonnelDashboard from '../components/PersonnelDashboard';

// dashboard wrapper - the portal only serves personnel
const DashboardPage: React.FC = () => {
  const userInfo = getUserInfo();

  if (userInfo?.role === 'Personnel') {
    return <PersonnelDashboard />;
  }

  return (
    <div className="container mt-5">
      <p className="text-muted">Kunne ikke laste dashbordet. Vennligst logg inn igjen.</p>
    </div>
  );
};

export default DashboardPage;
