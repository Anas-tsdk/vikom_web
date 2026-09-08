import React from 'react';
import { Table } from 'react-bootstrap';
import EmptyState from './EmptyState';
import './DataTable.css';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Custom cell renderer; defaults to the row's value at `key`. */
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  style?: React.CSSProperties;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  emptyIcon?: string;
  hover?: boolean;
  className?: string;
}

/**
 * Reusable table: a thin rounded card with a light header and a
 * white/transparent body. Styling is driven through Bootstrap's table CSS
 * variables (no `!important`). Columns are config-driven so callers don't
 * repeat cell markup. Renders an EmptyState when there is no data.
 */
function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyText = 'Ingen data å vise.',
  emptyIcon = 'inbox',
  hover = true,
  className = '',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="vk-table-wrap">
        <EmptyState icon={emptyIcon} text={emptyText} />
      </div>
    );
  }

  return (
    <div className="vk-table-wrap">
      <Table responsive hover={hover} className={`vk-table mb-0 ${className}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.headerClassName} style={col.style}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'vk-table-row-clickable' : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(row) : (row as Record<string, React.ReactNode>)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default DataTable;
