import React, { useState, useCallback, useRef, useEffect } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  initialSize?: number;
  minSize?: number;
  maxSize?: number;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  direction = 'horizontal',
  initialSize = 0.5,
  minSize = 0.15,
  maxSize = 0.85,
}) => {
  const [splitRatio, setSplitRatio] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;

      if (direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }

      ratio = Math.max(minSize, Math.min(maxSize, ratio));
      setSplitRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, minSize, maxSize]);

  const isHorizontal = direction === 'horizontal';
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  };

  const leftStyle: React.CSSProperties = {
    [isHorizontal ? 'width' : 'height']: `${splitRatio * 100}%`,
    overflow: 'auto',
  };

  const rightStyle: React.CSSProperties = {
    [isHorizontal ? 'width' : 'height']: `${(1 - splitRatio) * 100}%`,
    overflow: 'auto',
  };

  const dividerStyle: React.CSSProperties = {
    [isHorizontal ? 'width' : 'height']: '4px',
    [isHorizontal ? 'minWidth' : 'minHeight']: '4px',
    background: isDragging ? '#6c5ce7' : '#1a1b2e',
    cursor: isHorizontal ? 'col-resize' : 'row-resize',
    transition: isDragging ? 'none' : 'background 0.15s',
    flexShrink: 0,
  };

  return (
    <div ref={containerRef} className="split-pane" style={containerStyle}>
      <div className="split-pane-left" style={leftStyle}>
        {left}
      </div>
      <div
        className="split-pane-divider"
        style={dividerStyle}
        onMouseDown={handleMouseDown}
      />
      <div className="split-pane-right" style={rightStyle}>
        {right}
      </div>
    </div>
  );
};
