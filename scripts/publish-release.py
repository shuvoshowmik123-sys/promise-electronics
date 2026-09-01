"""
Publish a staff-app release to GitHub: create it, and attach the APK and the
web bundle.

Run it after building:

    npm run build && npx cap sync android
    cd android && ./gradlew assembleRelease && cd ..
    npm run app:bundle
    python scripts/publish-release.py v1.0.4

The token is read from a file outside this repository, never from the command
line and never from this source. A token on a command line ends up in the shell
history; a token in a repository ends up on GitHub, which for a token that can
write to GitHub is the worst possible place. Default location:

    E:/Android/gh-token.txt

Override with --token-file, or set GITHUB_TOKEN in the environment.

Safe to run twice. An existing release for the tag is reused rather than
duplicated, and an asset of the same name is replaced rather than rejected —
which matters, because the failure mode of a half-finished upload is a release
that exists with no file on it, and the app then offers a version nobody can
download.
"""

import argparse
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = "shuvoshowmik123-sys/promise-electronics"
API = "https://api.github.com"
DEFAULT_TOKEN_FILE = Path("E:/Android/gh-token.txt")

ROOT = Path(__file__).resolve().parent.parent
APK = Path("E:/Android/PromiseStaff-APK/PromiseStaff.apk")
BUNDLE_DIR = ROOT / "dist" / "bundles"


def read_token(explicit: "Path | None") -> str:
    env = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env:
        return env.strip()

    path = explicit or DEFAULT_TOKEN_FILE
    if not path.exists():
        sys.exit(
            f"No token found.\n\n"
            f"  Save a GitHub token to: {path}\n"
            f"  (one line, nothing else)\n\n"
            f"  Or set GITHUB_TOKEN in the environment."
        )
    token = path.read_text(encoding="utf-8").strip()
    if not token:
        sys.exit(f"{path} is empty.")
    return token


def request(token: str, method: str, url: str, body=None, headers=None, raw: bytes = None):
    hdrs = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "promise-release-publisher",
    }
    if headers:
        hdrs.update(headers)

    data = raw
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read()
            return res.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")
        # Never echo the token, whatever the server said.
        return err.code, {"error": detail[:400]}


def find_bundle(version: str) -> "Path | None":
    """The zip built for this version, if npm run app:bundle produced one."""
    candidate = BUNDLE_DIR / f"PromiseStaffWeb-{version}.zip"
    if candidate.exists():
        return candidate
    matches = sorted(BUNDLE_DIR.glob("PromiseStaffWeb-*.zip"))
    return matches[-1] if matches else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag", help="Release tag, e.g. v1.0.4")
    parser.add_argument("--token-file", type=Path, default=None)
    parser.add_argument("--notes", type=Path, default=None, help="File containing release notes")
    args = parser.parse_args()

    tag = args.tag if args.tag.startswith("v") else f"v{args.tag}"
    version = tag.lstrip("v")
    token = read_token(args.token_file)

    # ── Confirm who we are, before touching anything ──────────────────────────
    status, me = request(token, "GET", f"{API}/user")
    if status != 200:
        sys.exit(f"Token rejected ({status}). {me.get('error', '')}")
    print(f"  authenticated as {me.get('login')}")

    # ── The files ─────────────────────────────────────────────────────────────
    if not APK.exists():
        sys.exit(f"APK not found at {APK} — build it first.")
    bundle = find_bundle(version)
    if bundle is None:
        print("  ! no web bundle found — publishing the APK alone.")
        print("    Future updates will then need a manual install every time.")
    else:
        if bundle.name != f"PromiseStaffWeb-{version}.zip":
            print(f"  ! bundle is {bundle.name}, not PromiseStaffWeb-{version}.zip")
            print("    Run `npm run app:bundle` after bumping the version.")

    assets = [APK] + ([bundle] if bundle else [])
    for a in assets:
        print(f"  {a.name}  ({a.stat().st_size:,} bytes)")

    # ── Find or create the release ────────────────────────────────────────────
    status, release = request(token, "GET", f"{API}/repos/{REPO}/releases/tags/{tag}")
    if status == 200:
        print(f"  release {tag} already exists — reusing it")
    else:
        notes = args.notes.read_text(encoding="utf-8") if args.notes and args.notes.exists() else ""
        status, release = request(
            token,
            "POST",
            f"{API}/repos/{REPO}/releases",
            body={
                "tag_name": tag,
                "name": tag,
                "body": notes,
                "draft": False,
                "prerelease": False,
            },
        )
        if status not in (200, 201):
            sys.exit(f"Could not create the release ({status}). {release.get('error', '')}")
        print(f"  created release {tag}")

    release_id = release["id"]
    upload_base = re.sub(r"\{.*\}$", "", release["upload_url"])

    # ── Replace any asset of the same name, then upload ───────────────────────
    existing = {a["name"]: a["id"] for a in release.get("assets", [])}
    for path in assets:
        if path.name in existing:
            request(token, "DELETE", f"{API}/repos/{REPO}/releases/assets/{existing[path.name]}")
            print(f"  removed the previous {path.name}")

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".apk":
            content_type = "application/vnd.android.package-archive"

        print(f"  uploading {path.name} …")
        status, result = request(
            token,
            "POST",
            f"{upload_base}?name={path.name}",
            raw=path.read_bytes(),
            headers={"Content-Type": content_type},
        )
        if status not in (200, 201):
            sys.exit(f"Upload of {path.name} failed ({status}). {result.get('error', '')}")

    # ── Report what is actually on the release now ────────────────────────────
    status, release = request(token, "GET", f"{API}/repos/{REPO}/releases/{release_id}")
    print(f"\n  {release['html_url']}")
    for a in release.get("assets", []):
        print(f"    {a['name']}  {a['size']:,} bytes")

    has_apk = any(a["name"].endswith(".apk") for a in release.get("assets", []))
    has_zip = any(a["name"].endswith(".zip") for a in release.get("assets", []))
    print()
    print(f"    APK        {'yes' if has_apk else 'MISSING'}")
    print(f"    web bundle {'yes' if has_zip else 'MISSING — updates will need manual installs'}")
    print("\n  The server caches for 15 minutes before it offers this.\n")


if __name__ == "__main__":
    main()
