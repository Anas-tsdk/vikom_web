import React from 'react';

interface EmptyStateProps {
  icon?: string; // Bootstrap icon name without the "bi-" prefix
  text: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Centered empty-state placeholder (icon + text + optional action).
 * Generalizes the repeated `text-center py-4` empty blocks across the app.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  text,
  action,
  className = '',
}) => {
  return (
    <div className={`vk-empty-state text-center py-4 ${className}`}>
      <i className={`bi bi-${icon} display-5 text-muted d-block mb-2`} aria-hidden="true"></i>
      <p className="text-muted mb-0">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};

export default EmptyState;
