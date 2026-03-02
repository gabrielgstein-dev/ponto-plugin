interface LiveClockProps {
  time: string;
  date: string;
}

export function LiveClock({ time, date }: LiveClockProps) {
  return (
    <div className="clock-section">
      <div id="current-time" className="live-clock">{time}</div>
      <div id="current-date" className="live-date">{date}</div>
    </div>
  );
}
