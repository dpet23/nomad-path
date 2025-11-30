/** @jsx h */
import { h } from 'preact';
import { TrackSegment } from '../types';
import { useState } from 'preact/hooks';

interface SidebarProps {
  tracks: TrackSegment[];
  mapController: {
    toggleTrack: (trackId: string, visible: boolean) => void;
    highlightTrack: (trackId: string | null) => void;
    fitBounds: (bounds: { lat: number; lng: number }[]) => void;
  };
}

interface TrackTreeNode {
  dayLabel: string;
  trips: {
    tripName: string;
    tracks: TrackSegment[];
  }[];
}

export function Sidebar({ tracks, mapController }: SidebarProps) {
  // Group tracks by day → trip
  const grouped: TrackTreeNode[] = [];
  const dayMap = new Map<string, TrackTreeNode>();

  tracks.forEach((track) => {
    let dayNode = dayMap.get(track.dayLabel);
    if (!dayNode) {
      dayNode = { dayLabel: track.dayLabel, trips: [] };
      dayMap.set(track.dayLabel, dayNode);
      grouped.push(dayNode);
    }
    let tripNode = dayNode.trips.find((t) => t.tripName === track.tripName);
    if (!tripNode) {
      tripNode = { tripName: track.tripName, tracks: [] };
      dayNode.trips.push(tripNode);
    }
    tripNode.tracks.push(track);
  });

  return (
    <div className="sidebar">
      {grouped.map((day) => (
        <div key={day.dayLabel} className="day-node">
          <strong>{day.dayLabel}</strong>
          {day.trips.map((trip) => (
            <div key={trip.tripName} className="trip-node">
              <em>{trip.tripName}</em>
              <ul>
                {trip.tracks.map((track) => (
                  <li
                    key={track.trackId}
                    onMouseEnter={() => mapController.highlightTrack(track.trackId)}
                    onMouseLeave={() => mapController.highlightTrack(null)}
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      onChange={(e) =>
                        mapController.toggleTrack(track.trackId, e.currentTarget.checked)
                      }
                    />
                    {track.trackName}{' '}
                    <button
                      onClick={() => mapController.fitBounds(track.coords)}
                      title="Zoom to track"
                    >
                      🔍
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
