#!/usr/bin/env python3
"""Generate all synthetic spike data:

- data/trip.geojson     tracks (with per-point times + elevation) and waypoints
- media/full/*.jpg      placeholder "photos" (PIL-drawn), media/thumb/*.jpg
- media/full/video.mp4  small CC0 clip (downloaded once), with a drawn poster thumb
- index.html            from tools/index.template.html with the gallery baked in

The trip is a fictional 5-day Southern Lakes (NZ) holiday, March 2026.
Photo positions for "baked GPS" items are computed with the same
time->position interpolation the client bridge uses, plus a small offset,
so baked and interpolated markers can be compared on the map.
"""

import json
import math
import os
import random
import urllib.request
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NZDT = timezone(timedelta(hours=13))
random.seed(42)

VIDEO_URL = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4"

DAY_COLOURS = {
    1: ("#1d5fa8", "#7db3e8"),  # blue
    2: ("#1f7a33", "#8fd19a"),  # green
    3: ("#b07914", "#eecb7a"),  # amber
    4: ("#8c2f6b", "#dd9ac6"),  # magenta
    5: ("#0e7c7b", "#84cfce"),  # teal
}

DAY_NAMES = {
    1: "Day 1 — Flying in",
    2: "Day 2 — Glenorchy",
    3: "Day 3 — Over the Crown Range",
    4: "Day 4 — Roys Peak",
    5: "Day 5 — Homeward via Cromwell",
}


def T(day, hh, mm, ss=0):
    return datetime(2026, 3, 1 + day, hh, mm, ss, tzinfo=NZDT)


# ---------------------------------------------------------------- tracks

def polyline_point(ctrl, frac):
    """Point at `frac` (0..1) along a polyline of (lon, lat) control points."""
    # cumulative length with rough lat correction so distances aren't distorted
    lat0 = math.radians(ctrl[0][1])
    kx = math.cos(lat0)
    dists = [0.0]
    for a, b in zip(ctrl, ctrl[1:]):
        dists.append(dists[-1] + math.hypot((b[0] - a[0]) * kx, b[1] - a[1]))
    total = dists[-1]
    target = frac * total
    for i in range(len(ctrl) - 1):
        if dists[i + 1] >= target or i == len(ctrl) - 2:
            seg = dists[i + 1] - dists[i]
            f = 0 if seg == 0 else (target - dists[i]) / seg
            lon = ctrl[i][0] + (ctrl[i + 1][0] - ctrl[i][0]) * f
            lat = ctrl[i][1] + (ctrl[i + 1][1] - ctrl[i][1]) * f
            # unit perpendicular, for wiggle
            dx, dy = ctrl[i + 1][0] - ctrl[i][0], ctrl[i + 1][1] - ctrl[i][1]
            n = math.hypot(dx, dy) or 1
            return lon, lat, (-dy / n, dx / n)
    return ctrl[-1][0], ctrl[-1][1], (0, 0)


def make_leg(name, day, mode, ctrl, t0, t1, npts, ele_fn, wiggle=0.0):
    coords, times = [], []
    span = (t1 - t0).total_seconds()
    for i in range(npts):
        f = i / (npts - 1)
        lon, lat, perp = polyline_point(ctrl, f)
        if wiggle:
            w = wiggle * math.sin(f * math.pi * 14) + random.uniform(-wiggle, wiggle) * 0.3
            lon += perp[0] * w
            lat += perp[1] * w
        ele = ele_fn(f) + random.uniform(-3, 3)
        coords.append([round(lon, 6), round(lat, 6), round(ele, 1)])
        times.append((t0 + timedelta(seconds=span * f)).isoformat())
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": {"kind": "track", "name": name, "day": day, "mode": mode, "times": times},
    }


def flat(e):
    return lambda f: e


def ramp(e0, e1):
    return lambda f: e0 + (e1 - e0) * f


def flight_ele(f):
    # climb / cruise / descend
    if f < 0.2:
        return 30 + (10500 - 30) * (f / 0.2)
    if f > 0.85:
        return 10500 - (10500 - 350) * ((f - 0.85) / 0.15)
    return 10500


def roys_ele(f):
    # up to the summit at f=0.55 (long lunch at the top), back down
    if f < 0.55:
        return 311 + (1578 - 311) * (f / 0.55)
    return 1578 - (1578 - 311) * ((f - 0.55) / 0.45)


QT = (168.662, -45.031)
QT_AIRPORT = (168.739, -45.021)
GLENORCHY = (168.383, -44.849)
WANAKA = (169.131, -44.694)
CROMWELL = (169.196, -45.038)

DRIVE_QT_GLENORCHY = [QT, (168.615, -45.048), (168.55, -45.02), (168.48, -44.95),
                      (168.42, -44.90), (168.39, -44.86), GLENORCHY]
DRIVE_QT_WANAKA = [QT, (168.735, -45.005), (168.83, -44.95), (168.95, -44.93),
                   (169.01, -44.87), (169.06, -44.79), WANAKA]


def glenorchy_loop():
    cx, cy, r = 168.386, -44.842, 0.0065
    pts = []
    for i in range(25):
        th = -math.pi / 2 + 2 * math.pi * i / 24
        pts.append((cx + r * math.cos(th), cy + 0.7 * r * math.sin(th)))
    return pts


def roys_peak_path():
    # switchbacks from the carpark up the ridge
    a, b = (169.077, -44.690), (169.048, -44.681)
    pts = []
    n = 9
    for i in range(n + 1):
        f = i / n
        lon = a[0] + (b[0] - a[0]) * f
        lat = a[1] + (b[1] - a[1]) * f
        off = 0.004 * (1 - f) * (1 if i % 2 else -1)
        pts.append((lon, lat + off))
    return pts


def build_tracks():
    legs = [
        make_leg("Flight AKL→ZQN", 1, "flight",
                 [(174.792, -36.999), (173.5, -38.8), (171.8, -41.5), (170.0, -43.7),
                  (168.9, -44.9), QT_AIRPORT],
                 T(1, 9, 0), T(1, 10, 50), 40, flight_ele),
        make_leg("Airport → hotel", 1, "drive",
                 [QT_AIRPORT, (168.712, -45.023), (168.68, -45.026), QT],
                 T(1, 11, 30), T(1, 11, 55), 50, flat(350), wiggle=0.0002),
        make_leg("Queenstown → Glenorchy", 2, "drive", DRIVE_QT_GLENORCHY,
                 T(2, 9, 0), T(2, 9, 50), 120, flat(340), wiggle=0.0004),
        make_leg("Glenorchy Lagoon walkway", 2, "hike", glenorchy_loop(),
                 T(2, 10, 15), T(2, 12, 0), 150, flat(320), wiggle=0.0002),
        make_leg("Glenorchy → Queenstown", 2, "drive", DRIVE_QT_GLENORCHY[::-1],
                 T(2, 14, 0), T(2, 14, 50), 120, flat(340), wiggle=0.0004),
        make_leg("Queenstown → Wanaka (Crown Range)", 3, "drive", DRIVE_QT_WANAKA,
                 T(3, 10, 0), T(3, 11, 20), 140,
                 lambda f: 350 + (1076 - 350) * math.sin(min(f / 0.55, 1) * math.pi / 2)
                 if f < 0.55 else 1076 - (1076 - 300) * ((f - 0.55) / 0.45),
                 wiggle=0.0005),
        make_leg("Wanaka lakefront stroll", 3, "hike",
                 [(169.131, -44.694), (169.124, -44.696), (169.118, -44.698),
                  (169.112, -44.700), (169.118, -44.698), (169.126, -44.6955)],
                 T(3, 17, 10), T(3, 17, 50), 60, flat(280), wiggle=0.0001),
        make_leg("Roys Peak return", 4, "hike",
                 roys_peak_path() + roys_peak_path()[::-1],
                 T(4, 8, 0), T(4, 14, 30), 300, roys_ele, wiggle=0.0002),
        make_leg("Wanaka → Cromwell", 5, "drive",
                 [WANAKA, (169.15, -44.80), (169.14, -44.90), (169.20, -45.02), CROMWELL],
                 T(5, 10, 0), T(5, 10, 40), 90, ramp(290, 220), wiggle=0.0004),
        make_leg("Cromwell → Queenstown", 5, "drive",
                 [CROMWELL, (169.10, -45.01), (168.93, -45.01), (168.83, -45.005),
                  (168.74, -45.02), QT],
                 T(5, 11, 10), T(5, 12, 5), 100, ramp(220, 350), wiggle=0.0004),
    ]
    waypoints = [
        ("Queenstown hotel", QT, "lodging"),
        ("Glenorchy Lagoon lookout", (168.3925, -44.8375), "viewpoint"),
        ("Crown Range summit", (168.95, -44.93), "viewpoint"),
        ("Cardrona Hotel", (169.01, -44.87), "food"),
        ("That Wanaka Tree", (169.118, -44.698), "viewpoint"),
        ("Roys Peak summit", (169.048, -44.681), "viewpoint"),
        ("Cromwell fruit stall", (169.19, -45.015), "food"),
    ]
    wp_features = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": {"kind": "waypoint", "name": name, "icon": icon},
    } for name, (lon, lat), icon in waypoints]
    return {"type": "FeatureCollection", "features": legs + wp_features}


# ------------------------------------------------- time -> position lookup
# Mirrors the client-side algorithm in js/map.js.

def position_at_time(tracks, ts):
    best = None  # (gap_seconds, lonlat)
    for f in tracks["features"]:
        if f["properties"].get("kind") != "track":
            continue
        times = [datetime.fromisoformat(t) for t in f["properties"]["times"]]
        coords = f["geometry"]["coordinates"]
        if times[0] <= ts <= times[-1]:
            for i in range(len(times) - 1):
                if times[i] <= ts <= times[i + 1]:
                    span = (times[i + 1] - times[i]).total_seconds() or 1
                    g = (ts - times[i]).total_seconds() / span
                    lon = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * g
                    lat = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * g
                    return (lon, lat), 0
        else:
            gap = min(abs((times[0] - ts).total_seconds()),
                      abs((times[-1] - ts).total_seconds()))
            pt = coords[0] if abs((times[0] - ts).total_seconds()) < abs(
                (times[-1] - ts).total_seconds()) else coords[-1]
            if best is None or gap < best[0]:
                best = (gap, (pt[0], pt[1]))
    if best and best[0] <= 15 * 60:
        return best[1], best[0]
    return None, None


# ---------------------------------------------------------------- photos

# gps: "baked" -> data-lat/lon attributes; "track" -> client interpolates;
#      "none"  -> timestamp outside all tracks, no marker expected.
PHOTOS = [
    # day, hh, mm, title, caption, gps, kind
    (1, 10, 35, "Wing over the Southern Alps", "Window seat, flight AKL→ZQN", "track", "image"),
    (1, 11, 45, "First view of Lake Wakatipu", "Driving in from the airport", "baked", "image"),
    (1, 19, 32, "Dinner at the lodge", "No GPS indoors — and no track either", "none", "indoor"),
    (1, 19, 58, "Cheesecake situation", "", "none", "indoor"),
    (2, 9, 20, "Lakeside stop", "Glenorchy road pull-over", "baked", "image"),
    (2, 9, 21, "Lakeside panorama", "Same pull-over, seconds later", "baked", "image"),
    (2, 10, 40, "Boardwalk into the lagoon", "", "baked", "image"),
    (2, 11, 5, "Lookout burst 1/5", "Glenorchy Lagoon lookout", "baked", "image"),
    (2, 11, 5, "Lookout burst 2/5", "", "baked", "image"),
    (2, 11, 6, "Lookout burst 3/5", "", "baked", "image"),
    (2, 11, 7, "Lookout burst 4/5", "Camera without GPS", "track", "image"),
    (2, 11, 8, "Lookout burst 5/5", "Camera without GPS", "track", "image"),
    (2, 11, 45, "Tūī in the flax", "Long lens, no GPS", "track", "image"),
    (2, 14, 25, "Drive-back viewpoint", "", "baked", "image"),
    (3, 10, 35, "Crown Range lookout", "Highest sealed road in NZ", "baked", "image"),
    (3, 10, 50, "Cardrona Hotel", "Est. 1863. Camera without GPS", "track", "image"),
    (3, 17, 20, "Wanaka lakefront", "", "baked", "image"),
    (3, 17, 30, "That Wanaka Tree", "Obligatory", "baked", "image"),
    (3, 17, 35, "That Wanaka Tree — golden hour", "A short clip panning the lake", "baked", "video"),
    (4, 8, 5, "Trailhead sign", "Roys Peak, here we go", "baked", "image"),
    (4, 9, 30, "Valley opening up", "Mid-climb, camera without GPS", "track", "image"),
    (4, 11, 30, "Summit ridge 1/3", "That view", "baked", "image"),
    (4, 11, 31, "Summit ridge 2/3", "", "baked", "image"),
    (4, 11, 32, "Summit ridge 3/3", "Camera without GPS", "track", "image"),
    (4, 13, 10, "Lake Wanaka on descent", "", "baked", "image"),
    (5, 10, 35, "Fruit stall haul", "Cromwell stonefruit", "baked", "image"),
    (5, 11, 40, "Kawarau Gorge", "Bungy bridge from the road. No GPS", "track", "image"),
    (5, 21, 0, "Packing tetris", "Back at the hotel, no track recorded", "none", "indoor"),
]

FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def font(size):
    for p in FONT_DIRS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def draw_photo(path, day, idx, title, ts_str, gps_label, kind, size=(1600, 1200)):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    if kind == "indoor":
        c0, c1 = (40, 34, 30), (90, 70, 55)
    else:
        c0, c1 = hex_rgb(DAY_COLOURS[day][0]), hex_rgb(DAY_COLOURS[day][1])
    for y in range(h):
        f = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * f) for a, b in zip(c1, c0)))
    if kind != "indoor":
        # stylised mountains + lake
        rnd = random.Random(idx)
        for layer, shade in enumerate((60, 40, 25)):
            base = h * (0.55 + 0.12 * layer)
            pts = [(0, h)]
            x = 0
            while x < w:
                pts.append((x, base - rnd.randint(50, 260 - layer * 60)))
                x += rnd.randint(180, 320)
            pts += [(w, h)]
            d.polygon(pts, fill=(shade, shade + 8, shade + 18))
        d.ellipse([w * 0.78, h * 0.08, w * 0.90, h * 0.24], fill=(255, 240, 200))
        d.rectangle([0, h * 0.86, w, h], fill=(c0[0] // 2, c0[1] // 2, min(255, c0[2] + 40)))
    if kind == "video":
        d.polygon([(w / 2 - 80, h / 2 - 100), (w / 2 - 80, h / 2 + 100), (w / 2 + 110, h / 2)],
                  fill=(255, 255, 255))
        d.text((w / 2, h / 2 + 130), "VIDEO", font=font(64), fill="white", anchor="ma")
    d.text((60, 50), f"#{idx:02d}", font=font(140), fill="white")
    d.text((60, h - 240), title, font=font(72), fill="white")
    d.text((60, h - 140), ts_str, font=font(48), fill=(235, 235, 235))
    badge = {"baked": "EXIF GPS", "track": "NO GPS (interpolate)", "none": "NO GPS · NO TRACK"}[gps_label]
    bw = d.textlength(badge, font=font(44)) + 40
    d.rectangle([w - bw - 40, 60, w - 40, 130], fill=(0, 0, 0))
    d.text((w - bw - 20, 72), badge, font=font(44), fill="#ffd75e")
    img.save(path, quality=80)
    return img


def build_media(tracks):
    items = []
    for i, (day, hh, mm, title, caption, gps, kind) in enumerate(PHOTOS, 1):
        ts = T(day, hh, mm, random.randint(0, 30))
        lonlat, gap = position_at_time(tracks, ts)
        baked = None
        if gps == "baked":
            assert lonlat, f"photo {i} expected on-track time: {ts}"
            baked = (lonlat[0] + random.uniform(-2e-4, 2e-4),
                     lonlat[1] + random.uniform(-2e-4, 2e-4))
        if gps == "none":
            assert lonlat is None, f"photo {i} expected OFF-track time but got {lonlat} (gap {gap})"
        name = f"{'vid' if kind == 'video' else 'img'}{i:02d}"
        full = os.path.join(ROOT, "media/full", name + ".jpg")
        thumb = os.path.join(ROOT, "media/thumb", name + ".jpg")
        ts_str = ts.strftime("%a %d %b %Y · %H:%M")
        big = draw_photo(full, day, i, title, ts_str, gps, kind)
        big.resize((400, 300)).save(thumb, quality=75)
        items.append({
            "name": name, "kind": kind, "day": day, "ts": ts.isoformat(),
            "title": title, "caption": caption, "baked": baked,
        })
    return items


def fetch_video():
    dest = os.path.join(ROOT, "media/full/vid19.mp4")
    if os.path.exists(dest):
        return
    print("downloading placeholder video…")
    req = urllib.request.Request(VIDEO_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        f.write(r.read())


# ---------------------------------------------------------------- html

def card_html(it):
    a_attrs = [
        f'href="media/full/{it["name"]}{".mp4" if it["kind"] == "video" else ".jpg"}"',
        'data-pswp-width="1280" data-pswp-height="720"' if it["kind"] == "video"
        else 'data-pswp-width="1600" data-pswp-height="1200"',
        f'data-pswp-type="{"video" if it["kind"] == "video" else "image"}"',
        f'data-ts="{it["ts"]}"',
        'target="_blank"',
    ]
    if it["baked"]:
        a_attrs.append(f'data-lat="{it["baked"][1]:.6f}" data-lon="{it["baked"][0]:.6f}"')
    cap = f'<div class="meta caption">{it["caption"]}</div>' if it["caption"] else ""
    return f"""            <figure class="pswp-card">
                <a {' '.join(a_attrs)}>
                    <img alt="{it['title']}" src="media/thumb/{it['name']}.jpg">
                </a>
                <figcaption>
                    <div class="title">{it['title']}</div>
                    {cap}
                </figcaption>
            </figure>"""


def build_html(items):
    parts = []
    day = 0
    for it in items:
        if it["day"] != day:
            day = it["day"]
            parts.append(f'\n            <h2 class="day-heading" id="day-{day}">{DAY_NAMES[day]}</h2>\n')
        parts.append(card_html(it))
    tpl = open(os.path.join(ROOT, "tools/index.template.html")).read()
    out = tpl.replace("{{GALLERY}}", "\n".join(parts))
    open(os.path.join(ROOT, "index.html"), "w").write(out)


def main():
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "media/full"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "media/thumb"), exist_ok=True)
    tracks = build_tracks()
    json.dump(tracks, open(os.path.join(ROOT, "data/trip.geojson"), "w"))
    items = build_media(tracks)
    fetch_video()
    build_html(items)
    n_baked = sum(1 for i in items if i["baked"])
    print(f"done: {len(tracks['features'])} geojson features, {len(items)} media items "
          f"({n_baked} baked GPS, {sum(1 for p in PHOTOS if p[5] == 'track')} interpolated, "
          f"{sum(1 for p in PHOTOS if p[5] == 'none')} no-location)")


if __name__ == "__main__":
    main()
