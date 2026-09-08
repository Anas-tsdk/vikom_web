import React from 'react';
import './Avatar.css';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  imageUrl?: string | null;
  className?: string;
}

/**
 * Circular avatar that shows the initials derived from a name.
 * Falls back to a single glyph when no name is available. An optional
 * imageUrl renders a photo instead (future-proofing for uploaded avatars).
 */
const getInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const Avatar: React.FC<AvatarProps> = ({ name, size = 'md', imageUrl, className = '' }) => {
  return (
    <div className={`vk-avatar vk-avatar-${size} ${className}`} aria-hidden="true">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="vk-avatar-img" />
      ) : (
        <span className="vk-avatar-initials">{getInitials(name)}</span>
      )}
    </div>
  );
};

export default Avatar;
