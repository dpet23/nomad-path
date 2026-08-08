# Deploying

How this project gets to a public URL, and how it is changed and rolled back once it
is there. For *why* the architecture is shaped this way, see `DEPLOYMENT-DESIGN.md`.

## What deploys where

| Deployable | Host | Contains | Status |
|---|---|---|---|
| The site | Cloudflare Pages | `dist/`, built from this repo | this document |
| The gate | Cloudflare Worker | `/api/tileset`, strong key, Durable Object | `DEPLOYMENT-DESIGN.md` |

Both build from git on push. **Nothing is built or uploaded from a local machine.** A
locally built `dist/` has the API key baked into the bundle and must never be
published (see *Running without Node* in `README.md`).

The site does not depend on the gate. With `VITE_TILES_ENDPOINT` unset it renders in
no-tiles mode rather than failing, so it can be deployed and used before the gate
exists.

---

## Prerequisites

1. Repo on GitHub, with at least one branch pushed. Cloudflare cannot offer a repo it
   cannot see.
2. A Cloudflare account.
3. Decide which branch is public. It is **not necessarily `main`**.

---

## One-time setup

### Step 1 — Start the connection

1. Open <https://dash.cloudflare.com/>.
2. Sidebar → **Workers & Pages**.
3. **Create application** → **Pages** tab → **Connect to Git**.

### Step 2 — Install the GitHub App

1. Sign in with GitHub when prompted.
2. **Install & Authorize**.
3. At *Repository access*, choose **Only select repositories** → select this repo
   only.
4. Org-owned repos: you must be an org **owner** or hold the **GitHub Apps Manager**
   role. Personal repos need no special rights.

One GitHub account should point at one Cloudflare account.

### Step 3 — Configure the build

Select the repo → **Begin setup** → fill in:

| Field | Value |
|---|---|
| Project name | becomes `<name>.pages.dev` |
| Production branch | the branch chosen in *Prerequisites* |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(blank)* |
| Environment variables | *(none — see reference below)* |

**Save and Deploy.**

### Step 4 — Force build system v3

1. Project → **Settings** → **Build**.
2. Build system version must be **v3** → Node 22.16.0.
3. v2 is Node 18.17.1 and **fails the build**: Vite 7 requires `^20.19 || >=22.12`.
4. On v3, do not add a `.node-version` file or a `NODE_VERSION` variable.

### Step 5 — Record the hostname

Save `<name>.pages.dev`. Two later steps need that exact origin:

- the gate Worker's `Access-Control-Allow-Origin`
- the client key's Websites restriction — **never** `*.pages.dev`, which would
  authorise every Pages site on the internet

---

## Environment variables

Set in **Settings → Environment variables**. All are read at **build time**, so
changing any of them requires a rebuild to take effect (see *Applying a config
change*).

| Variable | Set on Pages? | Effect |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | **Never** | Bakes a live key into a public bundle in plaintext. This is the failure mode the whole design exists to prevent. Local `.env.local` only. |
| `VITE_TILES_ENDPOINT` | Once the gate Worker is live | The gate's URL. Unset ⇒ no-tiles mode. |
| `VITE_MAX_SCREEN_SPACE_ERROR` | Optional | Tile quality vs. request count. Higher = blurrier and cheaper. Not secret. |

Resulting states:

| `VITE_TILES_ENDPOINT` | Behaviour |
|---|---|
| unset | No-tiles mode: black background, controls and GeoJSON loading all work. |
| set, gate healthy | 3D tiles render. |
| set, gate returns 429 or fails | Falls back to no-tiles mode at runtime and shows a banner. |

---

## Routine deploys

1. Push to the **production branch** → builds and replaces `<name>.pages.dev`.
2. Push to **any other branch** → builds to its own preview hostname.

Preview hostnames do not match the client key's Websites restriction, so previews
render in no-tiles mode. That is intended, not a fault.

No dashboard action is required for a normal deploy.

## Applying a config change

Build settings and environment variables are read during the build, so editing them
does **not** change the live site on its own.

1. Edit the value in **Settings**.
2. Project → **Deployments** → latest deployment → **Retry deployment**, or push a
   commit.

## Verifying a deploy

1. **Deployments** → the run should end *Success*. Open the build log on failure.
2. Load the hostname. Expect the control panel and, with no endpoint configured, a
   black background.
3. Confirm no key shipped:

   ```sh
   curl -s https://<name>.pages.dev/ | grep -o 'assets/[^"]*\.js'   # find the bundle
   curl -s https://<name>.pages.dev/assets/<file>.js | grep -c AIza # must print 0
   ```

   Non-zero means a key reached the bundle. Treat it as a leak: remove the variable,
   rebuild, and rotate the key in the Google Cloud Console.

## Rolling back

Project → **Deployments** → pick a known-good deployment → **Rollback to this
deployment**. This re-points the hostname at an existing build; it does not rebuild,
so it also reverts nothing in git. Follow it with a git revert.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Repo missing from the picker | <https://github.com/settings/installations> → uninstall **Cloudflare Workers & Pages** → redo *Step 1* → **+ Add account**. |
| Cannot authorize an org repo | Need org **owner** or **GitHub Apps Manager**. |
| Build fails, Node/engine error | Build system is v2. See *Step 4*. |
| Build succeeds, page blank/black | Expected with `VITE_TILES_ENDPOINT` unset. |
| Tiles 403 after wiring the gate | Client key's Websites restriction does not name the exact origin, or it is a preview hostname. |
| Config edit had no effect | Build-time variable, needs a rebuild. See *Applying a config change*. |
| Manage or reinstall the Git connection | Project → **Settings** → **Builds**. |
