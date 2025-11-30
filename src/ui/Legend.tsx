/** @jsx h */
import { h } from 'preact';
import { ColorMode } from '../types';

interface LegendProps {
  mode: ColorMode;
}

// Example colors, can be refined later
const colorMaps: Record<ColorMode, { label: string; color: string }[]> = {
  timeOfDay: [
    { label: 'Sunrise', color: '#FFA500' },
    { label: 'Midday', color: '#00FF00' },
    { label: 'Sunset', color: '#FF4500' },
  ],
  speed: [
    { label: 'Slow', color: '#00FF00' },
    { label: 'Medium', color: '#FFFF00' },
    { label: 'Fast', color: '#FF0000' },
  ],
  transportMode: [
    { label: 'Walking', color: '#00FF00' },
    { label: 'Driving', color: '#0000FF' },
    { label: 'Public Transport', color: '#FF00FF' },
  ],
  heartRate: [
    { label: 'Low', color: '#00FF00' },
    { label: 'Medium', color: '#FFFF00' },
    { label: 'High', color: '#FF0000' },
  ],
};

export function Legend({ mode }: LegendProps) {
  const items = colorMaps[mode] || [];
  return (
    <div className="legend">
      {items.map((item) => (
        <div key={item.label} className="legend-item">
          <span className="legend-color" style={{ backgroundColor: item.color }}></span>
          {item.label}
        </div>
      ))}
    </div>
  );
}
