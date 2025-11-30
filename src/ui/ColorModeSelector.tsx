/** @jsx h */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { ColorMode } from '../types';

interface ColorModeSelectorProps {
  mapController: { setColorMode: (mode: ColorMode) => void };
}

const colorModes: { value: ColorMode; label: string }[] = [
  { value: 'timeOfDay', label: 'Time of Day' },
  { value: 'speed', label: 'Speed' },
  { value: 'transportMode', label: 'Transport Mode' },
  { value: 'heartRate', label: 'Heart Rate' },
];

export function ColorModeSelector({ mapController }: ColorModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<ColorMode>('timeOfDay');

  useEffect(() => {
    mapController.setColorMode(selectedMode);
  }, [selectedMode, mapController]);

  return (
    <div className="color-mode-selector">
      <select value={selectedMode} onChange={(e) => setSelectedMode(e.currentTarget.value as ColorMode)}>
        {colorModes.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
