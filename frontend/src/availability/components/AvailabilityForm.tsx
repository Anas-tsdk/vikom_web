import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../../auth/AuthService';
import type { Availability } from '../types/availability';

interface AvailabilityFormProps {
  initialData?: Availability;
  onSubmit: (data: Availability) => void;
  onCancel: () => void;
}

const AvailabilityForm: React.FC<AvailabilityFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const userInfo = getUserInfo();

  // Form state
  const [formData, setFormData] = useState<Availability>({
    id: initialData?.id,
    personnelId: initialData?.personnelId || userInfo?.userId || '',
    date: initialData?.date ? initialData.date.split('T')[0] : '',
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    notes: initialData?.notes || '',
    isBooked: initialData?.isBooked || false,
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: Availability) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Validate form
  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!formData.date) {
      newErrors.date = t('Date is required');
    } else {
      const selectedDate = new Date(formData.date);
      selectedDate.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.date = t('Date cannot be in the past');
      }
    }

    if (!formData.startTime) {
      newErrors.startTime = t('Start time is required');
    }

    if (!formData.endTime) {
      newErrors.endTime = t('End time is required');
    }

    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      newErrors.endTime = t('End time must be after start time');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    onSubmit(formData);
  };

  return (
    <Form onSubmit={handleSubmit}>
      {/* Date */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Date')}</Form.Label>
        <Form.Control
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          isInvalid={!!errors.date}
          required
        />
        <Form.Control.Feedback type="invalid">
          {errors.date}
        </Form.Control.Feedback>
      </Form.Group>

      {/* Start Time */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Start Time')}</Form.Label>
        <Form.Control
          type="time"
          name="startTime"
          value={formData.startTime}
          onChange={handleChange}
          isInvalid={!!errors.startTime}
          required
        />
        <Form.Control.Feedback type="invalid">
          {errors.startTime}
        </Form.Control.Feedback>
      </Form.Group>

      {/* End Time */}
      <Form.Group className="mb-3">
        <Form.Label>{t('End Time')}</Form.Label>
        <Form.Control
          type="time"
          name="endTime"
          value={formData.endTime}
          onChange={handleChange}
          isInvalid={!!errors.endTime}
          required
        />
        <Form.Control.Feedback type="invalid">
          {errors.endTime}
        </Form.Control.Feedback>
      </Form.Group>

      {/* Notes */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Notes (Optional)')}</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          name="notes"
          value={formData.notes || ''}
          onChange={handleChange}
          placeholder={t('Add any additional notes or details...')}
        />
      </Form.Group>

      {/* Form Actions */}
      <div className="d-flex justify-content-end gap-2">
        <Button variant="secondary" onClick={onCancel} type="button">
          {t('Cancel')}
        </Button>
        <Button variant="primary" type="submit">
          {t('Save')}
        </Button>
      </div>
    </Form>
  );
};

export default AvailabilityForm;
