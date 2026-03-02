import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { APP_NAME } from '../../domain/build-flags';

interface LiveClockProps {
  time: string;
  date: string;
}

export function LiveClock({ time, date }: LiveClockProps) {
  return (
    <div className="clock-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h1 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: 'var(--text)', 
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          {APP_NAME}
        </h1>
        <ThemeToggle />
      </div>
      <div id="current-time" className="live-clock">{time}</div>
      <div id="current-date" className="live-date">{date}</div>
    </div>
  );
}
