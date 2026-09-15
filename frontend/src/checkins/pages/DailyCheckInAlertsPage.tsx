import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import { localeForLanguage } from '../../i18n';
import DailyCheckInService, { type DailyCheckInAlert } from '../services/DailyCheckInService';
import './DailyCheckInAlertsPage.css';

const DailyCheckInAlertsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const authorized = isHeadNurseRole(getUserInfo()?.role);
  const [alerts, setAlerts] = useState<DailyCheckInAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string>();
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!authorized) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      setAlerts(await DailyCheckInService.getAlerts());
      setError('');
    } catch {
      setError(t('Kunne ikke laste trygghetsvarsler.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authorized, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!authorized) return;
    const onVisible = () => { if (!document.hidden) void load(true); };
    const interval = window.setInterval(() => { void load(true); }, 60_000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authorized, load]);

  const confirmOkay = async (alert: DailyCheckInAlert) => {
    try {
      setConfirming(alert.patientId);
      await DailyCheckInService.confirmPatientIsOkay(alert.patientId);
      setAlerts((current) => current.filter((item) => item.patientId !== alert.patientId));
      window.dispatchEvent(new Event('vikom-check-in-updated'));
      setError('');
    } catch {
      setError(t('Kunne ikke bekrefte at pasienten er trygg.'));
    } finally {
      setConfirming(undefined);
    }
  };

  if (!authorized) {
    return (
      <div className="daily-check-in-alerts-page personnel-page">
        <PageHeader title={t('Trygghetsvarsler')} />
        <div className="alert alert-danger" role="alert">
          {t('Kun ledende sykepleiere kan behandle trygghetsvarsler.')}
        </div>
      </div>
    );
  }

  return (
    <div className="daily-check-in-alerts-page personnel-page">
      <PageHeader
        title={t('Trygghetsvarsler')}
        subtitle={t('Pasienter som ikke har bekreftet at de er okay på tre dager.')}
      />

      {error && <div className="vk-error-alert" role="alert">{error}</div>}
      {loading ? (
        <p>{t('Laster trygghetsvarsler...')}</p>
      ) : alerts.length === 0 ? (
        <EmptyState icon="shield-check" text={t('Alle pasientene har det okay.')} />
      ) : (
        <div className="check-in-alert-grid">
          {alerts.map((alert) => (
            <article className="check-in-alert-card" key={alert.patientId}>
              <div className="check-in-alert-icon" aria-hidden="true">
                <i className="bi bi-exclamation-triangle-fill"></i>
              </div>
              <div className="check-in-alert-content">
                <div className="d-flex flex-wrap justify-content-between gap-2">
                  <div>
                    <h2>{alert.patientName}</h2>
                    <p className="check-in-alert-days">
                      {t('{{count}} dager uten innsjekking', { count: alert.missedDays })}
                    </p>
                  </div>
                  <span className="badge text-bg-danger align-self-start">{t('Krever oppfølging')}</span>
                </div>
                <dl>
                  <div><dt>{t('Sist bekreftet')}</dt><dd>{alert.lastCheckInAt
                    ? new Date(alert.lastCheckInAt).toLocaleString(localeForLanguage(i18n.resolvedLanguage))
                    : t('Aldri')}</dd></div>
                  {alert.phoneNumber && <div><dt>{t('Telefon')}</dt><dd>{alert.phoneNumber}</dd></div>}
                  {alert.address && <div><dt>{t('Adresse')}</dt><dd>{alert.address}</dd></div>}
                </dl>
                <div className="check-in-alert-actions">
                  <Link className="btn btn-outline-primary" to={`/patients/${alert.patientId}`}>
                    {t('Åpne pasient')}
                  </Link>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={confirming === alert.patientId}
                    onClick={() => void confirmOkay(alert)}
                  >
                    <i className="bi bi-check2-circle me-2" aria-hidden="true"></i>
                    {confirming === alert.patientId ? t('Lagrer...') : t('Pasienten har det okay')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyCheckInAlertsPage;
