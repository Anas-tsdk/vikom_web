import React from 'react';
import { Card } from 'react-bootstrap';
import './SectionCard.css';

interface SectionCardProps {
  title: React.ReactNode;
  icon?: string; // Bootstrap icon name without the "bi-" prefix
  action?: React.ReactNode; // optional control rendered on the right of the header
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Standard ViKom card: 1px dark border, light header with a title (and optional
 * icon + right-aligned action), rounded corners. Replaces the repeated
 * `<Card className="border-dark"><Card.Header className="bg-light ...">` pattern.
 */
const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon,
  action,
  bodyClassName = '',
  className = '',
  children,
}) => {
  return (
    <Card className={`vk-section-card border-dark ${className}`}>
      <Card.Header className="bg-light border-dark fw-semibold vk-section-card-header">
        <span className="vk-section-card-title">
          {icon && <i className={`bi bi-${icon} vk-section-card-icon`} aria-hidden="true"></i>}
          {title}
        </span>
        {action && <span className="vk-section-card-action">{action}</span>}
      </Card.Header>
      <Card.Body className={bodyClassName}>{children}</Card.Body>
    </Card>
  );
};

export default SectionCard;
