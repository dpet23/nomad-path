## **Final Structure - Confirmed**

```
/japan-2024/
└── tracks/                        ← ALL preprocessing I/O happens here
    ├── 2024-03-15-drive.gpx       (track)
    ├── 2024-03-16-hike.gpx        (track)
    ├── flight-SYD-NRT.kml         (track)
    ├── accommodations.gpx         (waypoints)
    ├── poi-landmarks.gpx          (waypoints)
    ├── trip-config.json           (optional config)
    └── (generated outputs:)
        └── trip-data.geojson      ← Single output file
```

**trip-data.geojson structure:**
```json
{
  "type": "FeatureCollection",
  "metadata": {
    "tripName": "Japan 2024",
    "attributeRanges": {
      "elevation": {"min": 0, "max": 2847, "unit": "m"},
      "speed": {"min": 0, "max": 142, "unit": "km/h"}
    }
  },
  "features": [
    // ... track features
    // ... POI features (from waypoints)
  ]
}
```

**Single file, single network request.** ✅

---

## **Setting Up Claude Code**

### **Step 1: Install Claude Code**

**If you haven't already:**

```bash
# Install via npm globally
npm install -g @anthropic-ai/claude-code

# Or via Homebrew (Mac)
brew install anthropic-ai/tap/claude-code
```

### **Step 2: Authenticate**

```bash
# Run auth command
claude auth login

# Follow browser prompt to authenticate with your Claude account
```

### **Step 3: Create Project Directory**

```bash
# Navigate to where you want the project
cd ~/projects  # or wherever

# Claude Code will create the project folder
```

### **Step 4: Start Claude Code Session**

**Option A: Let me create the project**
```bash
# Just navigate to your projects folder
cd ~/projects

# Then tell me to proceed - I'll run:
# claude code --new travel-map-viewer
```

**Option B: You create folder first**
```bash
mkdir travel-map-viewer
cd travel-map-viewer

# Initialize git
git init

# Then tell me to proceed
```

---

## **What Happens Next**

Once you say **"proceed"**, I will:

1. **Create project structure** in `travel-map-viewer/`
2. **Generate all config files** (package.json, tsconfig, rollup, etc.)
3. **Install dependencies** via `npm install`
4. **Setup git** with initial commit
5. **Generate initial README** with architecture overview
6. **You review** the setup, we iterate if needed
7. **Then start Epic 2** (preprocessing script)
