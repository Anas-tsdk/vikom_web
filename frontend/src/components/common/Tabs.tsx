import React from 'react';
import './Tabs.css';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  /** Bootstrap icon name without the "bi-" prefix. */
  icon?: string;
  /** Optional count rendered as a small pill after the label. */
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /**
   * When set, the tab bar and `children` are wrapped in a bordered rounded
   * card (matching the patient details page). Render the active tab's content
   * as children in this mode.
   */
  card?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reusable pill tab bar (shared `.vk-tabs-*` styling). Standardizes the tab
 * navigation previously hand-rolled per page. Pass `card` to wrap the bar and
 * its content in a bordered card.
 */
const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange, card, children, className = '' }) => {
  const nav = (
    <ul className={`vk-tabs-nav ${card ? '' : className}`.trim()} role="tablist">
      {tabs.map((tab) => (
        <li key={tab.key} className="vk-tabs-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeKey === tab.key}
            className={`vk-tab-button ${activeKey === tab.key ? 'active' : ''}`.trim()}
            onClick={() => onChange(tab.key)}
          >
            {tab.icon && <i className={`bi bi-${tab.icon}`} aria-hidden="true"></i>}
            <span className="vk-tab-label">{tab.label}</span>
            {tab.count !== undefined && <span className="vk-tab-count">{tab.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );

  if (!card) {
    return nav;
  }

  return (
    <div className={`vk-tabs-card ${className}`.trim()}>
      {nav}
      <div className="vk-tabs-content">{children}</div>
    </div>
  );
};

export default Tabs;
