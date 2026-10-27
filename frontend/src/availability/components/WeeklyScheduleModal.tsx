import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { fetchWeeklySchedule, updateWeeklySchedule } from '../services/AvailabilityService';
import type { WeeklyAvailabilityRule } from '../types/availability';
import { generateHourOptions } from '../../utils/dateUtils';

interface WeeklyScheduleModalProps {
  show: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  personnelId?: string;
  personnelName?: string;
}

const dayKeys: Record<number, string> = {
  0: 'Søndag',
  1: 'Mandag',
  2: 'Tirsdag',
  3: 'Onsdag',
  4: 'Torsdag',
  5: 'Fredag',
  6: 'Lørdag',
};

const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  show,
  onClose,
  onSaved,
  personnelId,
  personnelName,
}) => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<WeeklyAvailabilityRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hourOptions = generateHourOptions();

  useEffect(() => {
    if (!show) return;
    let active = true;
    setLoading(true);
    setError('');
    setRules([]);
    fetchWeeklySchedule(personnelId)
      .then((schedule) => { if (active) setRules(schedule); })
      .catch(() => { if (active) setError(t('Kunne ikke laste standarduken.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [personnelId, show, t]);

  const changeRule = (dayOfWeek: number, changes: Partial<WeeklyAvailabilityRule>) => {
    setRules((current) => current.map((rule) => (
      rule.dayOfWeek === dayOfWeek ? { ...rule, ...changes } : rule
    )));
  };

  const save = async () => {
    for (const rule of rules) {
      const start = rule.startTime || '09:00';
      const end = rule.endTime || '17:00';
      if (rule.isAvailable && start >= end) {
        setError(t('Sluttid må være etter starttid for {{day}}.', { day: t(dayKeys[rule.dayOfWeek]) }));
        return;
      }
    }
    try {
      setSaving(true);
      setError('');
      await updateWeeklySchedule(rules, personnelId);
      await onSaved();
      onClose();
    } catch (err) {
      setError(t(err instanceof Error ? err.message : 'Kunne ikke lagre standarduken.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{personnelName
          ? t('Fast ukeplan for {{name}}', { name: personnelName })
          : t('Fast ukeplan')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted">{t('Disse tidene gjentas hver uke. Endringer på enkeltdager i kalenderen overstyrer ukeplanen.')}</p>
        {error && <Alert variant="danger">{error}</Alert>}
        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {rules.map((rule) => (
              <Row key={rule.dayOfWeek} className="align-items-center border-bottom pb-2 g-2">
                <Col md={3}>
                  <Form.Check
                    type="switch"
                    id={`weekly-${rule.dayOfWeek}`}
                    label={t(dayKeys[rule.dayOfWeek])}
                    checked={rule.isAvailable}
                    onChange={(event) => changeRule(rule.dayOfWeek, { isAvailable: event.target.checked })}
                  />
                </Col>
                <Col md={3}>
                  <Form.Select
                    aria-label={t('Starttid for {{day}}', { day: t(dayKeys[rule.dayOfWeek]) })}
                    value={rule.startTime || ''}
                    disabled={!rule.isAvailable}
                    onChange={(event) => changeRule(rule.dayOfWeek, { startTime: event.target.value })}
                  >
                    <option value="">{t('Standard 09:00')}</option>
                    {hourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Select
                    aria-label={t('Sluttid for {{day}}', { day: t(dayKeys[rule.dayOfWeek]) })}
                    value={rule.endTime || ''}
                    disabled={!rule.isAvailable}
                    onChange={(event) => changeRule(rule.dayOfWeek, { endTime: event.target.value })}
                  >
                    <option value="">{t('Standard 17:00')}</option>
                    {hourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Control
                    value={rule.notes || ''}
                    disabled={!rule.isAvailable}
                    placeholder={t('Notat (valgfritt)')}
                    onChange={(event) => changeRule(rule.dayOfWeek, { notes: event.target.value })}
                  />
                </Col>
              </Row>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={saving}>{t('Avbryt')}</Button>
        <Button variant="primary" onClick={save} disabled={loading || saving || rules.length !== 7}>
          {saving ? t('Lagrer...') : t('Lagre fast ukeplan')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default WeeklyScheduleModal;
