/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { BackgroundMap, LatLng } from '../types';
import { MapLibreRenderer } from '../core/MapLibreRenderer';

interface MapSwitcherProps {
  map: MapLibreRenderer;
  maps: BackgroundMap[];
}

export function MapSwitcher({ map, maps }: MapSwitcherProps) {
  const [activeMapId, setActiveMapId] = useState(map['activeBackgroundMap'].id);

  const handleSelect = (id: string) => {
    setActiveMapId(id);
    map.setBackgroundMap(id);
  };

  return (
    <div className="map-switcher">
      <select value={activeMapId} onChange={(e) => handleSelect(e.currentTarget.value)}>
        {maps.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
