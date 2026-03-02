import { useState, useEffect } from 'react';
import { padZero } from '../../domain/time-utils';

export function useClock() {
  const [time, setTime] = useState(formatTime());
  const [date, setDate] = useState(formatDate());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime());
      setDate(formatDate());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { time, date };
}

function formatTime(): string {
  const now = new Date();
  return `${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
}

function formatDate(): string {
  const now = new Date();
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dias[now.getDay()]}, ${now.getDate()} ${meses[now.getMonth()]}`;
}
