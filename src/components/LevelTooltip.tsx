import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LEVEL_DESCRIPTIONS } from '../types';

interface LevelTooltipProps {
  level: string;
  children: React.ReactNode;
}

const LevelTooltip: React.FC<LevelTooltipProps> = ({ level, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const description = LEVEL_DESCRIPTIONS[level] || '';

  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 8, // 툴팁 위에 표시
        left: rect.left + rect.width / 2, // 중앙 정렬
      });
    }
  }, [showTooltip]);

  if (!description) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={triggerRef}
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children}
      </div>
      {showTooltip && createPortal(
        <div
          style={{
            ...tooltipStyles,
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
          }}
        >
          <div style={tooltipArrow}></div>
          <div style={tooltipContent}>
            <strong style={tooltipTitle}>{level}</strong>
            <div style={tooltipText}>{description}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const tooltipStyles: React.CSSProperties = {
  zIndex: 10000,
  minWidth: '250px',
  maxWidth: '350px',
  marginBottom: '8px',
};

const tooltipArrow: React.CSSProperties = {
  position: 'absolute',
  bottom: '-6px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 0,
  height: 0,
  borderLeft: '6px solid transparent',
  borderRight: '6px solid transparent',
  borderTop: '6px solid #333',
  pointerEvents: 'none',
};

const tooltipContent: React.CSSProperties = {
  backgroundColor: '#333',
  color: 'white',
  padding: '12px',
  borderRadius: '6px',
  fontSize: '0.875rem',
  lineHeight: '1.5',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const tooltipTitle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.95rem',
  fontWeight: '600',
};

const tooltipText: React.CSSProperties = {
  fontSize: '0.85rem',
  whiteSpace: 'normal',
  wordBreak: 'keep-all',
};

export default LevelTooltip;
