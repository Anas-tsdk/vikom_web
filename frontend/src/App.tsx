import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import {
  LoginPage,
  RegisterPage,
  PersonnelOnlyRoute,
  PublicOnlyRoute
} from './auth';
import HomePage from './home/HomePage';
import { DashboardPage } from './dashboard';
import { AppointmentListPage, CancelledAppointmentsPage } from './appointments';
import { AvailabilityCalendarPage } from './availability';
import { PatientListPage, PatientDetailsPage } from './patients';
import {
  VisitExecutionPage,
  VisitArchivePage,
  PlanningOverviewPage
} from './visits';
import NurseManagementPage from './personnel/pages/NurseManagementPage';
import DailyCheckInAlertsPage from './checkins/pages/DailyCheckInAlertsPage';
import * as AuthService from './auth/AuthService';

const App: React.FC = () => {
  const [sessionReady, setSessionReady] = useState(!AuthService.isAuthenticated());

  useEffect(() => {
    if (sessionReady) return;

    let active = true;
    void AuthService.refreshSession().finally(() => {
      if (active) setSessionReady(true);
    });

    return () => { active = false; };
  }, [sessionReady]);

  // Session refresh normally takes only a few milliseconds. Waiting here keeps
  // role-sensitive navigation from briefly rendering with stale permissions.
  if (!sessionReady) return null;

  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<PersonnelOnlyRoute><DashboardPage /></PersonnelOnlyRoute>} />
          <Route path="/patients" element={<PersonnelOnlyRoute><PatientListPage /></PersonnelOnlyRoute>} />
          <Route path="/patients/:username" element={<PersonnelOnlyRoute><PatientDetailsPage /></PersonnelOnlyRoute>} />
          <Route path="/appointments" element={<PersonnelOnlyRoute><AppointmentListPage /></PersonnelOnlyRoute>} />
          <Route path="/appointments/cancelled" element={<PersonnelOnlyRoute><CancelledAppointmentsPage /></PersonnelOnlyRoute>} />
          <Route path="/appointments/archive" element={<PersonnelOnlyRoute><VisitArchivePage /></PersonnelOnlyRoute>} />
          <Route path="/availability" element={<PersonnelOnlyRoute><AvailabilityCalendarPage /></PersonnelOnlyRoute>} />

          {/* New visit-related routes */}
          <Route path="/besok/:appointmentId" element={<PersonnelOnlyRoute><VisitExecutionPage /></PersonnelOnlyRoute>} />
          <Route path="/planning" element={<PersonnelOnlyRoute><PlanningOverviewPage /></PersonnelOnlyRoute>} />
          <Route path="/nurses" element={<PersonnelOnlyRoute><NurseManagementPage /></PersonnelOnlyRoute>} />
          <Route path="/alerts" element={<PersonnelOnlyRoute><DailyCheckInAlertsPage /></PersonnelOnlyRoute>} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
