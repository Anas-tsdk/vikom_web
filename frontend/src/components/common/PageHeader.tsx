import React from 'react';
import './PageHeader.css';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, links). Wrap-friendly on small screens. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header: title + optional subtitle on the left, optional
 * actions on the right. Pure Bootstrap utilities — no custom CSS.
 * Replaces the repeated `<h1>` + subtitle + action-row markup across pages.
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className = '' }) => {
  return (
    <div
      className={`d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 ${className}`.trim()}
    >
      <div>
        <h1 className="vk-page-title fw-bold mb-1">{title}</h1>
        {subtitle && <p className="vk-page-subtitle text-dark mb-0 lh-base">{subtitle}</p>}
      </div>
      {actions && <div className="d-flex flex-wrap gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
};

export default PageHeader;
