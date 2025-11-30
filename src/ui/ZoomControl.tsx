/** @jsx h */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MapLibreRenderer } from '../core/MapLibreRenderer';

interface ZoomControlProps {
  map: MapLibreRenderer;
}

export function ZoomControl({ map }: ZoomControlProps) {
  const [zoom, setZoom] = useState(map.map.getZoom());
  const [minZoom, setMinZoom] = useState(0);
  const [maxZoom, setMaxZoom] = useState(22);

  useEffect(() => {
    const update = () => setZoom(map.map.getZoom());
    map.map.on('zoom', update);
    return () => map.map.off('zoom', update);
  }, [map]);

  const handleZoom = (z: number) => {
    map.map.zoomTo(z);
  };

  const handleIncrement = () => handleZoom(Math.min(zoom + 1, maxZoom));
  const handleDecrement = () => handleZoom(Math.max(zoom - 1, minZoom));

  const zoomLevels = Array.from({ length: maxZoom - minZoom + 1 }, (_, i) => i + minZoom);

  return (
    <div className="zoom-control">
      <button onClick={handleDecrement}>-</button>
      {zoomLevels.map((z) => (
        <button
          key={z}
          onClick={() => handleZoom(z)}
          disabled={z < minZoom || z > maxZoom}
          style={{ fontWeight: z === Math.round(zoom) ? 'bold' : 'normal' }}
        >
          {z}
        </button>
      ))}
      <button onClick={handleIncrement}>+</button>
    </div>
  );
}
