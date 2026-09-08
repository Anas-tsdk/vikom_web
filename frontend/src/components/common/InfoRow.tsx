import React from 'react';
import './InfoRow.css';

interface InfoRowProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  icon?: string; // Bootstrap icon name without the "bi-" prefix
  emptyText?: string;
  className?: string;
}

/**
 * Key/value row used inside info cards. Replaces the repeated
 * `ListGroup.Item px-0 d-flex justify-content-between` markup.
 * Renders `emptyText` (muted) when the value is empty.
 */
const InfoRow: React.FC<InfoRowProps> = ({
  label,
  value,
  icon,
  emptyText = 'Ikke oppgitt',
  className = '',
}) => {
  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className={`vk-info-row ${className}`}>
      <span className="vk-info-row-label">
        {icon && <i className={`bi bi-${icon} vk-info-row-icon`} aria-hidden="true"></i>}
        {label}
      </span>
      <span className={`vk-info-row-value ${isEmpty ? 'text-muted' : ''}`}>
        {isEmpty ? emptyText : value}
      </span>
    </div>
  );
};

export default InfoRow;
