#!/usr/bin/env bash
set -euo pipefail
smoke_temp="$(mktemp -d)"
export RUNNER_TEMP="$smoke_temp"

# `scripts/serve-dist.ts` rather than `astro preview`: preview manages
# a background daemon, which leaves "has the server started" ambiguous
# and can outlive the step. This serves the same `dist/` in the
# foreground on 0.0.0.0, so the IPv4 probes below always reach it.
PORT=4321 bun run scripts/serve-dist.ts &
server=$!
trap 'kill "${server}" 2>/dev/null || true; rm -rf "$smoke_temp"' EXIT

# Readiness loop, deliberately NOT `curl --retry`: this distinguishes
# "not up yet" from "up but broken", so a real 500 fails fast instead
# of being retried into a timeout.
timeout 90 bash -c 'until curl -fsS -o /dev/null http://127.0.0.1:4321/; do sleep 1; done'

# Assert on CONTENT, not just status — a 200 error page would sail
# through a status-only check.
#
# The body goes to a file rather than into `curl ... | grep -q`:
# grep -q exits at the first match, curl then dies of SIGPIPE with
# exit 23, and `pipefail` turns that into a failure. Whether it trips
# depends on response size and timing, so the piped form is
# intermittently red rather than reliably broken.
#
# The site publishes two HTML routes: the Danish default locale and
# the /en prefix, which is where a routing or i18n regression shows up
# first.
for path in / /en/; do
  echo "==> ${path}"
  curl -fsS -m 10 -o "${RUNNER_TEMP}/page.html" "http://127.0.0.1:4321${path}"
  grep -q '<title>' "${RUNNER_TEMP}/page.html" \
    || { echo "SMOKE FAILED: ${path} served no <title>"; exit 1; }
done

# The address field is the page's entire purpose. If it is missing,
# the site is serving a shell with nothing to use.
echo "==> the address field is present"
curl -fsS -m 10 -o "${RUNNER_TEMP}/home.html" "http://127.0.0.1:4321/"
grep -q 'id="emne-input"' "${RUNNER_TEMP}/home.html" \
  || { echo "SMOKE FAILED: the home page has no address field"; exit 1; }

# The per-page snapshot the client fetches. This is the assertion that
# proves the committed data reached the build: a broken content loader
# still serves a 200 home page with a working-looking field and no
# data behind it at all.
echo "==> /videoer/1970-erne.json"
curl -fsS -m 10 -o "${RUNNER_TEMP}/emne.json" \
  "http://127.0.0.1:4321/videoer/1970-erne.json"
bun -e '
  const entry = await Bun.file(process.env.RUNNER_TEMP + "/emne.json").json();
  if (entry?.slug !== "1970-erne") throw new Error("wrong slug: " + entry?.slug);
  if (!Array.isArray(entry.videos) || entry.videos.length !== 13) {
    throw new Error("expected 13 videos, got " + entry?.videos?.length);
  }
  for (const v of entry.videos) {
    if (typeof v?.id !== "string" || v.id === "") throw new Error("empty video id");
    if (v.provider !== "youtube" && v.provider !== "vimeo") {
      throw new Error("unknown provider: " + v.provider);
    }
  }
  console.log("snapshot OK:", entry.title, "-", entry.videos.length, "videos");
'

# A page absent from the snapshot must 404 rather than serve an empty
# document: that 404 is how the client decides to try the live lookup.
echo "==> a page outside the snapshot 404s"
status=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
  "http://127.0.0.1:4321/videoer/findes-ikke-nogen-steder.json")
[ "${status}" = "404" ] \
  || { echo "SMOKE FAILED: unknown snapshot returned ${status}, expected 404"; exit 1; }

# The catalogue routes the single-page refactor removed. A stale link
# must 404 rather than serve a half-working page.
echo "==> removed routes stay removed"
for path in /emner /emner/1970-erne /indsaet /en/emner; do
  status=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:4321${path}")
  [ "${status}" = "404" ] \
    || { echo "SMOKE FAILED: ${path} returned ${status}, expected 404"; exit 1; }
done

# A static host serves the 404 page with a 404 status. `curl -f` would
# abort on that, so this probe checks the status code explicitly.
echo "==> 404 handling"
status=$(curl -sS -m 10 -o "${RUNNER_TEMP}/404.html" -w '%{http_code}' \
  "http://127.0.0.1:4321/der-findes-ikke")
[ "${status}" = "404" ] \
  || { echo "SMOKE FAILED: unknown route returned ${status}, expected 404"; exit 1; }
grep -q '<title>' "${RUNNER_TEMP}/404.html" \
  || { echo "SMOKE FAILED: 404 page served no <title>"; exit 1; }
