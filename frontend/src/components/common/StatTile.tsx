import React from 'react';
import './StatTile.css';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  icon?: string; // Bootstrap icon name without the "bi-" prefix
  className?: string;
}

/**
 * Compact KPI tile (icon + value + label) used in the patient header strip
 * to surface key numbers at a glance.
 */
const StatTile: React.FC<StatTileProps> = ({ label, value, icon, className = '' }) => {
  return (
    <div className={`vk-stat-tile ${className}`}>
      {icon && (
        <span className="vk-stat-tile-icon" aria-hidden="true">
          <i className={`bi bi-${icon}`}></i>
        </span>
      )}
      <div className="vk-stat-tile-text">
        <div className="vk-stat-tile-value">{value}</div>
        <div className="vk-stat-tile-label">{label}</div>
      </div>
    </div>
  );
};

export default StatTile;
