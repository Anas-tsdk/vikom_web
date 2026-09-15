import { useCallback, useEffect, useState } from 'react';
import { isHeadNurseRole } from '../../auth/roles';
import { getUserInfo } from '../../auth/AuthService';
import DailyCheckInService from '../services/DailyCheckInService';

export default function useDailyCheckInAlertCount(): number {
  const [count, setCount] = useState(0);
  const enabled = isHeadNurseRole(getUserInfo()?.role);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setCount((await DailyCheckInService.getAlerts()).length);
    } catch {
      // Navigation stays usable while the backend is temporarily unavailable.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    window.addEventListener('vikom-check-in-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('vikom-check-in-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return count;
}
