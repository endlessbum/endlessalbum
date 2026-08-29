import React, { useRef, useEffect, useState } from 'react';

interface MarqueeTextProps {
  children: React.ReactNode;
  speed?: number; // px/sec
  className?: string;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({ children, speed = 40, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (container && text) {
      setShouldScroll(text.scrollWidth > container.offsetWidth);
    }
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden whitespace-nowrap ${className}`}
      style={{ minWidth: 0 }}
    >
      <div
        ref={textRef}
        className={shouldScroll ? 'marquee-text' : ''}
        style={shouldScroll ? {
          animation: `marquee ${textRef.current ? textRef.current.scrollWidth / speed : 10}s linear infinite` }
          : {}}
      >
        {children}
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-text {
          display: inline-block;
          padding-right: 2rem;
          will-change: transform;
        }
      `}</style>
    </div>
  );
};
