interface TrackSegment {
    tripId: string;
    tripName: string;
    dayId: string;
    dayLabel: string;
    trackId: string;
    trackName: string;
    segmentId: number;
    coords: LatLng[];
    timestamps: number[];
    speed?: number[];
    heartRate?: number[];
    transportMode?: string;
}

interface Waypoint {
    tripId: string;
    dayId: string;
    sequence: number;
    name: string;
    lat: number;
    lon: number;
}
