import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface WheelPickerProps {
  options: string[] | number[];
  value: string | number;
  onChange: (value: any) => void;
  label?: string;
}

export const WheelPicker: React.FC<WheelPickerProps> = ({ options, value, onChange, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 44; // Matches the height in pixels
  const [selectedIndex, setSelectedIndex] = useState(options.indexOf(value as any));

  useEffect(() => {
    const index = options.indexOf(value as any);
    if (index !== -1 && index !== selectedIndex) {
      setSelectedIndex(index);
      if (containerRef.current) {
        containerRef.current.scrollTop = index * itemHeight;
      }
    }
  }, [value, options]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    if (index !== selectedIndex && index >= 0 && index < options.length) {
      setSelectedIndex(index);
    }
    
    // Fallback for scroll end detection
    clearTimeout((window as any).wheelScrollTimeout);
    (window as any).wheelScrollTimeout = setTimeout(() => {
      handleScrollEnd();
    }, 150);
  };

  const handleScrollEnd = () => {
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      onChange(options[selectedIndex]);
    }
  };

  // Add empty slots at the beginning and end to allow the first and last items to be centered
  const displayItems = ['', '', ...options, '', ''];

  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</span>}
      <div className="relative h-[220px] w-16 overflow-hidden">
        {/* Selection Highlight */}
        <div className="absolute top-1/2 left-0 right-0 h-11 -translate-y-1/2 border-y border-indigo-100 bg-indigo-50/30 pointer-events-none rounded-lg" />
        
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          onScrollEnd={handleScrollEnd}
          className="h-full overflow-y-scroll no-scrollbar snap-y snap-mandatory py-[88px]"
          style={{ scrollBehavior: 'smooth' }}
        >
          {options.map((option, index) => {
            const distance = Math.abs(index - selectedIndex);
            const opacity = Math.max(0.2, 1 - distance * 0.3);
            const scale = Math.max(0.8, 1 - distance * 0.1);
            const rotateX = (index - selectedIndex) * 20;

            return (
              <div 
                key={index}
                className="h-11 flex items-center justify-center snap-center transition-all duration-150"
                style={{ 
                  opacity, 
                  transform: `scale(${scale}) rotateX(${rotateX}deg)`,
                }}
              >
                <span className={cn(
                  "text-lg font-bold transition-colors",
                  index === selectedIndex ? "text-indigo-600 scale-110" : "text-slate-400"
                )}>
                  {typeof option === 'number' ? option.toString().padStart(2, '0') : option}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
