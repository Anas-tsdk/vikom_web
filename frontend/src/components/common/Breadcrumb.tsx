import React from 'react';
import { Link } from 'react-router-dom';
import './Breadcrumb.css';

export interface BreadcrumbItem {
  label: string;
  /** When set, the crumb is a link; the first linked crumb gets a back arrow. */
  to?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Global, borderless breadcrumb: "← First / Second / Current".
 * Linked crumbs navigate; the trailing crumb is muted.
 */
const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  return (
    <nav className={`vk-breadcrumb ${className}`.trim()} aria-label="Brødsmulesti">
      {items.map((item, index) => {
        const isFirst = index === 0;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && <span className="vk-breadcrumb-sep" aria-hidden="true">/</span>}
            {item.to ? (
              <Link to={item.to} className="vk-breadcrumb-link">
                {isFirst && <i className="bi bi-arrow-left" aria-hidden="true"></i>}
                {item.label}
              </Link>
            ) : (
              <span className="vk-breadcrumb-current">{item.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;
