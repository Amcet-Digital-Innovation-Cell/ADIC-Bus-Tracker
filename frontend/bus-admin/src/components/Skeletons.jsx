/**
 * src/components/Skeletons.jsx
 * ─────────────────────────────────────────────────────────────
 * Reusable Skeleton Loaders with smooth shimmer animations
 * to eliminate jarring layout shifts and blank loading states.
 * ─────────────────────────────────────────────────────────────
 */

import React from 'react';

/**
 * Base Shimmer Bar component
 */
export function SkeletonBar({ width = '100%', height = '16px', borderRadius = '6px', style = {}, className = '' }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: '#e2e8f0',
        backgroundImage: 'linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmerPulse 1.5s infinite ease-in-out',
        ...style,
      }}
    />
  );
}

/**
 * Table Rows Skeleton Loader
 */
export function TableSkeleton({ rows = 6, cols = 8, rowHeight = '48px' }) {
  return (
    <tbody className="table-skeleton-body">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="table-skeleton-row" style={{ height: rowHeight, borderBottom: '1px solid #f1f5f9' }}>
          {Array.from({ length: cols }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: '12px 14px' }}>
              <SkeletonBar
                width={cIdx === 0 ? '24px' : cIdx === 1 ? '70%' : cIdx === 2 ? '85%' : '60%'}
                height="14px"
                borderRadius="4px"
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * KPI Metric Card Skeleton Loader
 */
export function StatsCardSkeleton({ count = 4 }) {
  return (
    <div
      className="stats-skeleton-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
        gap: '16px',
        marginBottom: '20px',
      }}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            padding: '18px 20px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonBar width="45%" height="13px" />
            <SkeletonBar width="32px" height="32px" borderRadius="8px" />
          </div>
          <SkeletonBar width="60%" height="26px" />
          <SkeletonBar width="35%" height="12px" />
        </div>
      ))}
    </div>
  );
}

/**
 * Dropdown Selector Skeleton Loader
 */
export function SelectSkeleton({ height = '42px' }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: '8px',
        border: '1.5px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        boxSizing: 'border-box',
      }}
    >
      <SkeletonBar width="50%" height="14px" />
    </div>
  );
}
