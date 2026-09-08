import React from 'react';
import { Spinner } from 'react-bootstrap';
import './IconButton.css';

interface IconButtonProps {
  icon: string; // Bootstrap icon name without the "bi-" prefix
  onClick?: () => void;
  title: string; // tooltip + accessible label
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * Square, outlined icon-only button (1px border, transparent fill, rounded
 * corners). Used for compact row/card actions such as edit and delete.
 */
const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  title,
  type = 'button',
  disabled = false,
  loading = false,
  className = '',
}) => {
  return (
    <button
      type={type}
      className={`vk-icon-btn ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={title}
    >
      {loading ? (
        <Spinner animation="border" size="sm" />
      ) : (
        <i className={`bi bi-${icon}`} aria-hidden="true"></i>
      )}
    </button>
  );
};

export default IconButton;
