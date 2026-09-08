import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import type { AvailabilityWindow, CreateAvailabilityWindowDto, UpdateAvailabilityWindowDto } from '../types/availability';
import { generateHourOptions, formatDateLong, parseISODate } from '../../utils/dateUtils';

interface AvailabilityWindowFormProps {
  initialData?: AvailabilityWindow;
  selectedDate: string;
  onSubmit: (data: CreateAvailabilityWindowDto | UpdateAvailabilityWindowDto) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
}

const AvailabilityWindowForm: React.FC<AvailabilityWindowFormProps> = ({
  initialData,
  selectedDate,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
}) => {
  const hourOptions = generateHourOptions();
  
  const [formData, setFormData] = useState<CreateAvailabilityWindowDto | UpdateAvailabilityWindowDto>({
    date: initialData?.date || selectedDate,
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    notes: initialData?.notes || '',
    isAvailable: initialData?.isAvailable ?? true,
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.date) {
      newErrors.date = 'Dato er påkrevd';
    }

    // Only validate times if both are provided
    if (formData.startTime && formData.endTime) {
      if (formData.startTime >= formData.endTime) {
        newErrors.endTime = 'Sluttid må være etter starttid';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    onSubmit(formData);
  };

  const hasBookedSlots = initialData?.slots?.some((s) => s.isBooked) || false;

  return (
    <Form onSubmit={handleSubmit}>
      {/* Date (Read-only) */}
      <Form.Group className="mb-3">
        <Form.Label>Dato</Form.Label>
        <Form.Control
          type="text"
          value={formatDateLong(parseISODate(formData.date))}
          readOnly
          disabled
        />
      </Form.Group>

      {/* Available Toggle */}
      <Form.Group className="mb-3">
        <Form.Check
          type="switch"
          id="isAvailable"
          name="isAvailable"
          label="Tilgjengelig?"
          checked={formData.isAvailable}
          onChange={handleChange}
        />
        <Form.Text className="text-muted">
          Velg om du er tilgjengelig eller ikke denne dagen.
        </Form.Text>
      </Form.Group>

      {/* Time Range */}
      {formData.isAvailable && (
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Starttid</Form.Label>
              <Form.Select
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                isInvalid={!!errors.startTime}
              >
                <option value="">Velg starttid</option>
                {hourOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
              <Form.Control.Feedback type="invalid">
                {errors.startTime}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                La stå tomt for å bruke standard (09:00)
              </Form.Text>
            </Form.Group>
          </Col>

          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Sluttid</Form.Label>
              <Form.Select
                name="endTime"
                value={formData.endTime}
                onChange={handleChange}
                isInvalid={!!errors.endTime}
              >
                <option value="">Velg sluttid</option>
                {hourOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
              <Form.Control.Feedback type="invalid">
                {errors.endTime}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                La stå tomt for å bruke standard (17:00)
              </Form.Text>
            </Form.Group>
          </Col>
        </Row>
      )}

      {/* Notes */}
      <Form.Group className="mb-3">
        <Form.Label>Notater</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Valgfrie notater om tilgjengeligheten..."
        />
      </Form.Group>

      {/* Warning for booked slots */}
      {hasBookedSlots && (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <strong>Merk:</strong> Denne tilgjengeligheten har bookede avtaler. Du kan ikke endre tidsintervallet.
        </div>
      )}

      {/* Action Buttons */}
      <div className="d-flex justify-content-between">
        <div>
          {onDelete && initialData && (
            <Button
              variant="danger"
              onClick={onDelete}
              disabled={hasBookedSlots || isSubmitting}
            >
              <i className="bi bi-trash me-2"></i>Slett
            </Button>
          )}
        </div>
        <div className="d-flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Avbryt
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Lagrer...' : (initialData ? 'Oppdater' : 'Opprett')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

export default AvailabilityWindowForm;
