# Deploying

Cloudflare Pages, built from git on push. Never build locally and upload — a local
`dist/` has the API key baked into the bundle.

Two deployables: the site here, and the tileset Worker in `worker/` that hands it a
key at runtime. Until the Worker is wired up, the site runs in no-tiles mode: black
background, controls and GeoJSON loading all work.

Worker setup is under *Setup: the tileset Worker*; how it works is in
`worker/README.md`.

## Setup

1. Push to a GitHub repo

   * Then GitHub -> Account Settings -> Applications -> Cloudflare Workers and Pages -> Repository access -> select new repo -> Save

2. Publish on Cloudflare Pages
    * Log in to: https://pages.cloudflare.com
    * Build -> Workers & Pages -> Create application -> Looking to deploy Pages? Get started
    * Import an existing Git repository -> select new repo -> Begin setup
        * Framework: none
        * Build command: `npm run build`
        * Build output: `dist`
        * Env vars: <empty>
        * Production branch: the one that goes live, not necessarily `main`

3. Enable privacy with Cloudflare Access
    * Build -> Workers & Pages -> select item & go to settings
    * General -> Access policy -> enable -> Manage
        * Access policies -> "Allow Members" -> Configure -> add emails -> Save
        * Destinations -> Edit Application URL to remove the `*.` from the subdomain
        * Details -> Session Duration to 1 month
    * Then can manage from:
        Cloudflare -> Protect & Connect -> Zero Trust -> Access Controls -> Applications

4. Record the hostname
    * `<name>.pages.dev` -> needed later by the Worker's `ALLOWED_ORIGIN`
    * Same origin goes in the mesh key's Websites restriction -> exact origin only, never `*.pages.dev`

---

## Setup: the tileset Worker

1. Create the Worker
    * Build -> Workers & Pages -> Create application -> start from any template
        * Don't import a Git repository -> with no Wrangler config in the repo, autoconfig detects a framework and opens a PR against it
        * Don't add variables or secrets
    * Deploy once -> assigns the name and hostname

2. Record the hostname
    * `<worker>.<subdomain>.workers.dev` -> the first label is the Worker's name
    * The name must equal `name` in `worker/wrangler.jsonc`, or the build fails
    * `https://<worker>.<subdomain>.workers.dev/api/tileset` -> the site's `VITE_TILES_ENDPOINT`

3. Connect the Worker to the repo
    * Push `worker/wrangler.jsonc` first -> the build reads it from the root directory
    * Worker -> Settings -> Builds -> Connect -> select the repo
        * Root directory: `worker`
        * Build command: <empty>
        * Deploy command: `npx wrangler deploy`
        * Production branch: the one the site deploys from

4. Check the code deployed
    ```sh
    curl -s https://<worker>.<subdomain>.workers.dev/api/tileset
    ```
    * Expect `{"error":"misconfigured","missing":"ROOT_TILES_KEY"}`
    * Template output or `404` -> Deployments -> open the build log

5. Create two keys in the Google Cloud Console
    * Console paths: README -> *Getting a Google Maps API key*, steps 4-5
    * Root key -> the Worker fetches `root.json` with it, nothing else holds it
        * API restrictions -> Restrict key -> Map Tiles API
        * Application restrictions: none -> set in step 7
    * Mesh key -> browsers fetch mesh tiles with it
        * API restrictions -> Restrict key -> Map Tiles API
        * Application restrictions -> Websites -> `https://<name>.pages.dev`, exact
    * "Websites" is what the README calls HTTP referrers -> same control, relabelled
    * Restriction types are mutually exclusive -> none, or Websites, or IP, or Android, or iOS
    * Leave the `.env.local` key alone -> it stays IP-restricted, for local dev only

6. Set both keys as Worker secrets
    * Worker -> Settings -> Variables and Secrets -> Add -> type Secret -> Deploy
        * `ROOT_TILES_KEY`: the root key
        * `MESH_TILES_KEY`: the mesh key

7. Set the referrer the root key is locked to
    * Generate: `printf 'https://%s.invalid/root\n' "$(openssl rand -hex 8)"`
    * One value, two strings, not interchangeable:
        * Worker secret `ROOT_TILES_REFERER`: `https://<hex>.invalid/root` -> sent as a header, so a URL
        * Root key -> Application restrictions -> Websites: `https://<hex>.invalid/*` -> stored by Google, so a pattern
    * The path is arbitrary; the restriction is a wildcard, so any path matches
    * `.invalid` is reserved by RFC 2606 -> can never be registered

8. Check the Worker serves a tileset
    ```sh
    curl -s https://<worker>.<subdomain>.workers.dev/api/tileset | head -c 120
    ```
    * Expect `{"meshKey":"AIza...","tileset":{"asset":...`
    * `{"error":"upstream_failed","status":403}` -> root key rejected; compare its Websites value with `ROOT_TILES_REFERER`
    * Each call is a billable root request -> check once, don't loop

9. Check the cache
    ```sh
    curl -s https://<worker>.<subdomain>.workers.dev/api/tileset | grep -o '"cached":[a-z]*'
    ```
    * Run twice -> expect `"cached":false` then `"cached":true`
    * `false` both times -> the cache is not working; do not point the site at it yet

10. Point the site at the Worker
    * Pages -> Settings -> Variables and Secrets -> Add -> type **Text**, not Secret
        * `VITE_TILES_ENDPOINT`: `https://<worker>.<subdomain>.workers.dev/api/tileset`
    * Deployments -> Retry deployment -> build-time variable, so it needs a rebuild
    * Load the site -> 3D tiles render

---

## Check it is behaving

Google will not cap spending on this account, so these two checks are what stand in
for it. Neither needs the site, a phone, or devtools.

1. Is the cache working?

    ```sh
    curl -s https://<worker>.<subdomain>.workers.dev/api/tileset \
      | grep -o '"cached":[a-z]*\|"fetchedAt":"[^"]*"'
    ```

    * There is one cached document shared by everyone -> checking from anywhere checks it for everyone
    * `"cached":true` with a `fetchedAt` up to 2.5h old -> working
    * `"cached":false` twice running -> broken; the caps will stop it at `DAILY_CAP`

2. Is Google's usage what it should be?

    * Google Maps Platform -> Quotas -> Map Tiles API -> *root tileset queries*
    * **Expect at most ~10 per day**, whatever the traffic -> one per 2.5h TTL
    * Materially more -> either the cache broke, or `MESH_TILES_KEY` leaked and is
      being used elsewhere. The Worker cannot see the second case.
    * Leak -> rotate `MESH_TILES_KEY` -> one secret edit, no rebuild

---

## Verify a deploy

1. Check the build ran
    * Build -> Workers & Pages -> select item -> Deployments -> latest should be Success
    * On failure, open the build log

2. Check the page
    * Load the hostname -> control panel visible, background black

3. Check no key shipped
    ```sh
    curl -s https://<name>.pages.dev/ | grep -o 'assets/[^"]*\.js'    # find bundle
    curl -s https://<name>.pages.dev/assets/<file>.js | grep -c AIza  # must be 0
    ```
    * Non-zero -> a key reached the bundle. Remove the env var, rebuild, rotate the key in Google Cloud Console.

---

## Routine deploys

* Push to the production branch -> rebuilds, replaces `<name>.pages.dev`
* Push to any other branch -> builds to its own preview hostname
    * Previews don't match the client key's Websites restriction -> they render in no-tiles mode. Intended.
* No dashboard action needed

---

## Env vars

All are read at build time, so editing one does nothing until a rebuild.

| Variable | Set on Pages? | Effect |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | **Never** | Bakes a live key into a public bundle in plaintext. Local `.env.local` only. |
| `VITE_TILES_ENDPOINT` | Once the Worker is live | The Worker's `/api/tileset` URL. Unset ⇒ no-tiles mode. |
| `VITE_MAX_SCREEN_SPACE_ERROR` | Optional | Tile quality vs. request count. Higher = blurrier and cheaper. Not secret. |

Resulting states:

| `VITE_TILES_ENDPOINT` | Behaviour |
|---|---|
| unset | No-tiles mode: black background, controls and GeoJSON loading all work. |
| set, Worker healthy | 3D tiles render. |
| set, Worker returns 429 or fails | Falls back to no-tiles mode at runtime, shows a banner. |

To apply a change:

1. Settings -> Variables and Secrets -> edit -> Save
2. Deployments -> latest -> Retry deployment, or push a commit

---

## Roll back

* Deployments -> pick a known-good one -> Rollback to this deployment
* Re-points the hostname at an existing build. Doesn't rebuild, doesn't touch git -> follow with a git revert.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Repo missing from the picker | <https://github.com/settings/installations> → uninstall **Cloudflare Workers & Pages** → redo *Step 1* → **+ Add account**. |
| Cannot authorize an org repo | Need org **owner** or **GitHub Apps Manager**. |
| Build fails, Node/engine error | Build system is v2 (Node 18.17.1); Vite 7 needs `^20.19 \|\| >=22.12`. Settings → Build → set build system **v3** (Node 22.16.0). Do not add `.node-version` or `NODE_VERSION`. |
| Build succeeds, page blank/black | Expected with `VITE_TILES_ENDPOINT` unset. |
| Worker build fails, `npm ci` / EUSAGE | `worker/package-lock.json` is missing. The build runs `npm clean-install`, which refuses without one. Regenerate: `cd worker && npm install --package-lock-only`. |
| Tiles 403 after wiring the Worker | Mesh key's Websites restriction does not name the exact origin, or it is a preview hostname. |
| Config edit had no effect | Build-time variable, needs a rebuild. See *Env vars → To apply a change*. |
| Manage or reinstall the Git connection | Project → **Settings** → **Builds**. |
