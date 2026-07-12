# Learnings: how to build the album site (custom scripts vs SSG)

Companion to [LEARNINGS.md](LEARNINGS.md) (the map ↔ gallery bridge). This one
answers the follow-up question: *given one HTML page + one geojson + one
media.yml per trip, is custom scripts + templates the way to go, or is there
something nicer that someone else maintains?*

**Verdict: build a small custom tool — one `build.py` + one Jinja2 template —
and keep `website_media.py`, retrofitted with a build manifest. No SSG.**
The maintained-by-others itch is satisfied one level down: Jinja2, PyYAML,
Pillow, ffmpeg, exiftool are all boring and stable. The only bespoke part is
a ~300-line orchestrator, which is precisely the part no framework can own
because it encodes this site's policy (yaml-driven watermarks, per-trip
builds, the map data, PhotoSwipe card markup).

All file references below are to the `website` repo unless stated otherwise.

---

## 1. Current state (what the recommendation is grounded in)

What exists today, per trip (e.g. `album/vanuatu2024/`):

- `media.yml` — **already the single source of truth**, used both to generate
  the gallery HTML and to drive the media pipeline. Items already carry
  `datetime` with timezone offset — exactly what the map bridge needs for
  `data-ts`. No per-image sidecars, and none are needed.
- `index.html` — static, with the gallery cards baked in.
- `res_map/…` — legacy gpsvisualizer iframe map, to be replaced by
  nomad-path + a `trip.geojson`.

The pain points, concretely:

- **Shared tooling lives inside one trip.** `generate_media_yml.py`,
  `validate_media.py`, `schema.py`, `website_media.py` all live under
  `album/europe2022/`, so every new trip depends on a *sibling trip's
  folder* — at build time (scripts) and at runtime
  (`../europe2022/res_dependencies/photoswipe…` in vanuatu2024's HTML).
- **Gallery HTML generation is an append hack.** The documented workflow
  (`album/README.md`) ends in
  `generate_media_yml.py … >> ../index.html` followed by hand-tidying.
- **The PHP experiment failed for a structural reason.** Each PHP page was a
  *program*; adapting the site meant editing code per page. (The deploy
  pipeline itself — `deploy.py` → `php2html.py`, sass, validate, minify — is
  fine and worth keeping.)
- **`website_media.py` freshness = file existence.** See §3.

## 2. The recommended shape

```
album/
  _tools/
    build.py               # single entry point: build.py vanuatu2024
    templates/
      trip.html.j2         # evolved from the spike's tools/index.template.html
      index.html.j2        # trip index page (§5)
    website_media.py       # moved out of europe2022, + manifest (§3)
    schema.py, validate_media.py, generate_media_yml.py
  _shared/                 # photoswipe, bootstrap, css — replaces ../europe2022/res_dependencies
  vanuatu2024/
    media.yml              # gallery index + page metadata (title, theme colour, visibility)
    trip.geojson
    res_img/original-…/    # originals (read-only, §4)
    res_img/full|thumb/    # generated
    index.html             # generated
```

`build.py <trip>` does, in order:

1. load + validate `media.yml` (reuse `validate_media.build_media_data`);
2. run the media pipeline for that trip, incrementally (§3) — this is the
   "hook in the image script" requirement, satisfied by being the same
   process, not a hook;
3. render `trip.html.j2` with the yaml data → `index.html` (gallery cards
   with `data-ts` / `data-lat` / `data-lon` baked in, per the bridge spike);
4. regenerate the trip index page (§5);
5. optionally hand off to the existing `deploy.py` steps (validate/minify).

**The design rule that prevents a repeat of the PHP experience: pages are
data, not programs.** All trip-specific variation lives in `media.yml`
(title, colours, visibility, captions); there is exactly one trip template.
A new trip = new folder with yaml + geojson + originals, zero new code. If a
trip ever genuinely needs different markup, that's a template feature toggled
by a yaml field, not a fork of the page.

Per-trip publishing — the requirement SSGs fight — is trivial here because
the trip *is* the build unit.

## 3. `website_media.py`: keep it, give it a manifest

What it does (1044 lines, `album/europe2022/deploy/website_media.py`):
yaml-driven watermark layers (position/colour/opacity per item, shared
defaults via yaml anchors), web-size + thumbnail images via Pillow,
video transcode + poster via ffmpeg, EXIF scrub/rewrite via exiftool,
multiprocessing pool with progress bar. The structure is good.

**The gap: freshness is `if not path.is_file() or args.overwrite`**
(lines ~345 for images, ~493 for videos). Consequences:

- editing yaml metadata (e.g. a watermark moved `TL` → `BR`) changes nothing
  the script looks at → stale outputs unless you `--overwrite` *everything*
  or hand-delete outputs — the source of the current manual-fix loop;
- an interrupted run leaves a half-written jpeg that the existence check
  treats as complete forever.

### The fix: a build manifest (~40 lines, no new dependencies)

`res_img/.build-manifest.json`, mapping each output path to a signature:

```python
sig = sha256(json.dumps({
    "src":    [src.stat().st_mtime_ns, src.stat().st_size],
    "item":   item_as_dict,          # the resolved yaml for THIS item
    "params": [IMG_SIZE_FULL, IMG_SIZE_THUMB, SCRIPT_VERSION],
}, sort_keys=True, default=str).encode()).hexdigest()
```

Rebuild an output iff its stored signature differs or the file is missing.
Write the manifest entry only after the output is successfully written.
This is exactly the wanted definition of *changed* — "file on disk + metadata
in yaml" — and two properties fall out for free:

- **yaml anchors are expanded at load time** by PyYAML, so editing a shared
  `&default_watermark` automatically dirties every item that inherits it;
- **bumping size/quality constants** (via `params`) dirties everything, so
  a global re-render is a version bump, not an `--overwrite` flag you have
  to remember.

Plus **atomic writes**: save to `path.with_name(name + '.tmp')`, then
`os.replace()` into place. Interrupted runs then leave no lies behind.

`mtime_ns + size` is the right source signature for originals (fast, and
originals shouldn't change); content hashing is reserved for the integrity
ledger in §4.

### Considered and rejected

- **pydoit** — the one credible "someone else maintains the incremental
  engine" option (Python task graph, checksum-based `uptodate`). Rejected
  because the pipeline is linear, parallelism already exists via
  `multiprocessing`, and the manifest is ~40 lines; doit adds a conceptual
  layer without deleting any existing code.
- **make / ninja** — dependencies here are *yaml fragments*, not files;
  encoding "this item's dict changed" in file-based build systems means
  generating stamp files, i.e. building the manifest anyway but spread
  across the filesystem.
- **Replacing the script wholesale** — nothing does what it does, and the
  reason is worth stating precisely: the *transformations* (resize,
  transcode, exif scrub) are commodity; the *policy* (per-item watermark
  specs from yaml, trip conventions, video↔poster pairing) is bespoke.
  Gallery generators (sigal, thumbsup) and image servers (imgproxy, thumbor —
  runtime, not build-time) each cover half and fight the rest.

## 4. Protecting the originals (without a second copy)

No duplicate of the originals is needed; the requirement is that the write
path is *structurally unable* to reach the source tree, plus a tripwire:

1. **A single output-guard helper** used by every save site:
   `assert not out_path.is_relative_to(PATH_MEDIA_SOURCE)`. The exiftool
   call is the one to watch — today `_update_metadata()` correctly receives
   only output paths, but a guard turns that from convention into property.
2. **`chmod -R a-w`** on the `original-fullsize-*` folders. Free,
   reversible, and protects against every tool, not just this script.
3. **Integrity ledger** (rides on the manifest): record each original's
   sha256 the first time it's seen; add a `--verify` mode that re-hashes and
   reports mismatches. Detects both accidental edits and bit-rot — the
   actual "just in case" fear — with zero duplication. Cheap runs skip the
   hash (mtime/size only); `--verify` is the periodic deep check.

(Real disaster recovery remains a backup/second-repo concern, outside build
tooling.)

## 5. Trip index page + selective sharing

Nearly free once `build.py` exists: iterate `album/*/media.yml`, pull
title / date range / hero thumbnail, render `index.html.j2`.

The tension between "index for my own memory" and "somewhat hidden URLs" has
a standard resolution — a per-trip field in `media.yml`:

```yaml
visibility: public   # or: unlisted
```

- **public** → listed on the index page.
- **unlisted** → exactly today's behaviour: reachable by URL, never linked.
  Add `<meta name="robots" content="noindex">` to unlisted pages (template
  conditional) so a stray crawler or an accidentally-public link doesn't
  surface them in search.
- For a personal complete list: emit a second, everything-index at an
  unguessable path — or don't deploy it at all and open the locally-built
  copy.

Honest limit: names like `vanuatu2024` are guessable by pattern, so
*unlisted is a courtesy curtain, not access control* — which matches how the
URLs are used today. (Random slug suffixes would harden new trips, at the
cost of uglier URLs; not recommended unless the threat model changes.)

## 6. Why not a static site generator

- **Wrong content model.** The content is structured data (yaml + geojson)
  plus a bespoke media pipeline — not markdown prose. Using Hugo/Eleventy/
  Astro means writing custom data loaders and shortcodes: your own code
  again, but hosted inside a framework that majors every year or two. That
  is the PHP adaptability problem with a bigger dependency attached.
- **Wrong build unit.** SSGs build sites; the publishing unit here is one
  trip. Partial builds exist (`--incremental` etc.) but are always against
  the grain.
- **Unused strengths.** Themes, taxonomies, feeds, nav across hundreds of
  pages — none apply to ~10 art-directed pages.
- **Docs generators (mkdocs, zensical)** additionally assume markdown + a
  nav tree; a full-bleed map and a PhotoSwipe grid mean fighting the theme.
  The "more trouble than it's worth" instinct was correct.

**The flip condition:** if cross-trip features become real — a searchable/
tagged trips index, RSS, markdown journal text woven between gallery
sections — an SSG starts paying rent. Pick **Eleventy** in that world: its
data cascade consumes yaml/JSON natively, lock-in is minimal, and the Jinja2
templates port almost unchanged (Nunjucks is a Jinja dialect).

## 7. Suggested migration order

Each step is independently shippable; stop anywhere and things still work:

1. **Manifest + atomic writes in `website_media.py`** — kills the
   manual-fix loop; touches nothing else. Do this first.
2. Move shared tooling out of `europe2022/` → `album/_tools/`; vendor shared
   runtime deps → `album/_shared/` (template makes the path a one-line
   change).
3. `build.py <trip>` + `trip.html.j2` — replaces the `>> index.html` hack;
   this is where the bridge's `data-ts`/`data-lat`/`data-lon` attributes get
   baked in (see the spike's `tools/generate.py` + `card_html()` for the
   working prototype of exactly this step).
4. Trip index + `visibility` field.
5. Wire into `deploy.py` as a pre-step or subcommand.

## 8. Tie-in with the bridge spike

The bridge (see [LEARNINGS.md](LEARNINGS.md)) needs three things from the
generated HTML, all of which belong in `media.yml` and the template:

- `data-ts` — already available (`datetime` per item);
- `data-lat`/`data-lon` — extract EXIF GPS at media-pipeline time
  (`generate_media_yml.py` already runs exiftool over originals; extend it
  to record GPS into `media.yml`, keeping the no-sidecar property);
- optional per-item `title`/`caption` fields for the lightbox captions.

The spike's `tools/generate.py` is the working miniature of `build.py`
step 3: yaml-shaped data in, PhotoSwipe cards with bridge attributes out.
