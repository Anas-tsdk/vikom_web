import React from 'react';
import './Badge.css';

export type BadgeColor =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'light'
  | 'connected';

interface BadgeProps {
  /** Background colour — the only colour knob. Defaults to a neutral gray. */
  bg?: BadgeColor;
  /** Adds the shared dark border. */
  bordered?: boolean;
  /** Bootstrap icon name without the "bi-" prefix. */
  icon?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The single badge used across the app. Fixed font-size, padding, radius and
 * (when bordered) border colour — only the background colour and the border
 * toggle vary per instance. Badges sit inside modules, so they're smaller than
 * buttons.
 */
const Badge: React.FC<BadgeProps> = ({
  bg = 'neutral',
  bordered = false,
  icon,
  className = '',
  children,
}) => {
  return (
    <span
      className={`vk-badge vk-badge--${bg} ${bordered ? 'vk-badge--bordered' : ''} ${className}`.trim()}
    >
      {icon && <i className={`bi bi-${icon}`} aria-hidden="true"></i>}
      {children}
    </span>
  );
};

export default Badge;
