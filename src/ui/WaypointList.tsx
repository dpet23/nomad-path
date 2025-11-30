/** @jsx h */
import { h } from 'preact';
import { Waypoint } from '../core/MapLibreRenderer';

interface WaypointListProps {
  waypoints: Waypoint[];
  mapController: {
    focusWaypoint: (id: string) => void;
  };
}

export function WaypointList({ waypoints, mapController }: WaypointListProps) {
  return (
    <div className="waypoint-list">
      <strong>Accommodations</strong>
      <ul>
        {waypoints.map((wp) => (
          <li key={wp.id}>
            <button onClick={() => mapController.focusWaypoint(wp.id)}>
              {wp.order ?? '?'} – {wp.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
