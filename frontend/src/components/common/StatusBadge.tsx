import React from 'react';
import Badge, { type BadgeColor } from './Badge';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Maps a domain status to the shared Badge: a coloured pill with a Norwegian
 * label. Supports appointment + visit statuses.
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toLowerCase();

  const color = ((): BadgeColor => {
    switch (normalized) {
      case 'booked':
        return 'info';
      case 'inprogress':
      case 'active':
        return 'warning';
      case 'completed':
      case 'available':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'notcompleted':
      case 'incomplete':
        return 'neutral';
      default:
        return 'neutral';
    }
  })();

  const label = ((): string => {
    switch (normalized) {
      case 'booked':
        return 'Planlagt';
      case 'inprogress':
      case 'active':
        return 'Pågår';
      case 'completed':
        return 'Fullført';
      case 'cancelled':
        return 'Avlyst';
      case 'notcompleted':
        return 'Ikke gjennomført';
      case 'incomplete':
        return 'Ikke fullført';
      case 'available':
        return 'Tilgjengelig';
      default:
        return status;
    }
  })();

  return (
    <Badge bg={color} className={className}>
      {label}
    </Badge>
  );
};

export default StatusBadge;
