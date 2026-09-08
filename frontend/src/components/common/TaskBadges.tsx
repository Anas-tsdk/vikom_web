import React from 'react';
import Badge, { type BadgeColor } from './Badge';

interface TaskBadgesProps {
  tasks: string;
  /** Background colour for the task badges (defaults to neutral). */
  variant?: BadgeColor;
  className?: string;
}

/**
 * Renders a comma-separated task string as individual shared Badges.
 */
const TaskBadges: React.FC<TaskBadgesProps> = ({ tasks, variant = 'neutral', className = '' }) => {
  const taskList = tasks
    .split(',')
    .map((task) => task.trim())
    .filter((task) => task.length > 0);

  if (taskList.length === 0) {
    return <span className="text-muted">Ingen oppgaver</span>;
  }

  return (
    <div className={`d-flex flex-wrap gap-2 ${className}`.trim()}>
      {taskList.map((task, index) => (
        <Badge key={index} bg={variant}>
          {task}
        </Badge>
      ))}
    </div>
  );
};

export default TaskBadges;
