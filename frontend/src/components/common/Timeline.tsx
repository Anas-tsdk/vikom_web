import React from 'react';
import EmptyState from './EmptyState';
import './Timeline.css';

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  date?: string;
  icon?: string; // Bootstrap icon name without the "bi-" prefix
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
}

interface TimelineProps {
  items: TimelineItem[];
  emptyText?: string;
  emptyIcon?: string;
  className?: string;
}

/**
 * Vertical activity feed with a connecting rail and per-item dots/icons.
 * Renders an EmptyState when there are no items.
 */
const Timeline: React.FC<TimelineProps> = ({
  items,
  emptyText = 'Ingen aktivitet å vise.',
  emptyIcon = 'activity',
  className = '',
}) => {
  if (items.length === 0) {
    return <EmptyState icon={emptyIcon} text={emptyText} />;
  }

  return (
    <ul className={`vk-timeline ${className}`}>
      {items.map((item) => (
        <li key={item.id} className="vk-timeline-item">
          <span className={`vk-timeline-dot text-bg-${item.variant || 'primary'}`}>
            {item.icon && <i className={`bi bi-${item.icon}`} aria-hidden="true"></i>}
          </span>
          <div className="vk-timeline-content">
            <div className="vk-timeline-row">
              <span className="vk-timeline-title">{item.title}</span>
              {item.date && <span className="vk-timeline-date">{item.date}</span>}
            </div>
            {item.meta && <div className="vk-timeline-meta">{item.meta}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
};

export default Timeline;
