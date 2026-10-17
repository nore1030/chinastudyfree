#!/usr/bin/env python3
"""Release asset uploader that preserves non-ASCII asset names.

`gh release upload` derives the asset name from the file basename, but on this
Windows/Git-Bash machine the MSYS2 argv conversion strips non-ASCII bytes from
arguments passed to native binaries, so Chinese file names arrive at GitHub
mangled (e.g. `聪聪学堂-便携版-0.1.0.zip` -> `-.-0.1.0.zip`). Two different
Chinese names can even collapse into the same mangled name and silently
overwrite each other.

This script talks to the GitHub REST API directly. The asset name is
percent-encoded inside the URL (pure ASCII), and file paths are opened by
Python itself (native Unicode support on Windows), so nothing gets mangled.

Usage:
    GH_TOKEN=$(gh auth token) python scripts/upload-release-assets.py list <release_id>
    GH_TOKEN=$(gh auth token) python scripts/upload-release-assets.py upload <release_id> <local-path> <asset-name>
    GH_TOKEN=$(gh auth token) python scripts/upload-release-assets.py delete <release_id> <asset_id>
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"
OWNER_REPO = "tanle-mtr/ChinaStudyFree"
USER_AGENT = "chinastudyfree-release-uploader"


def _headers(extra=None):
    token = os.environ.get("GH_TOKEN")
    if not token:
        sys.exit("GH_TOKEN is not set. Run: export GH_TOKEN=$(gh auth token)")
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": USER_AGENT,
    }
    headers.update(extra or {})
    return headers


def _request(url, method="GET", data=None, headers=None, timeout=600):
    req = urllib.request.Request(url, data=data, method=method, headers=headers if headers is not None else _headers())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        # GitHub strips non-ASCII characters from asset names, and uploads
        # occasionally answer 502 *after* the asset was created. Treat both as
        # "verify with list" instead of aborting the whole batch.
        if exc.code == 422 and "already_exists" in detail:
            print(f"  warn: asset already exists (HTTP 422) for {method} {url}")
            return None
        if exc.code in (500, 502, 503):
            print(f"  warn: HTTP {exc.code} for {method} {url} - asset may exist server-side, verify with list")
            return None
        sys.exit(f"HTTP {exc.code} for {method} {url}: {detail}")


def list_assets(release_id):
    assets = _request(f"{API}/repos/{OWNER_REPO}/releases/{release_id}/assets")
    for a in assets:
        print(f"{a['id']}\t{a['size']}\t{a['state']}\t{a['name']}")
    print(f"-- {len(assets)} assets --")
    return assets


def upload_asset(release_id, local_path, asset_name):
    if not os.path.isfile(local_path):
        sys.exit(f"local file not found: {local_path}")
    quoted = urllib.parse.quote(asset_name)
    url = f"{UPLOADS}/repos/{OWNER_REPO}/releases/{release_id}/assets?name={quoted}"
    with open(local_path, "rb") as fh:
        payload = fh.read()
    print(f"uploading {asset_name} ({len(payload)} bytes) ...", flush=True)
    result = _request(
        url,
        method="POST",
        data=payload,
        headers={
            "Authorization": f"token {os.environ['GH_TOKEN']}",
            "Content-Type": "application/octet-stream",
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        },
    )
    if result is None:
        print(f"  unknown state for {asset_name} - run `list` to verify")
        return None
    print(f"  ok: id={result['id']} name={result['name']} size={result['size']} state={result['state']}")
    return result


def delete_asset(release_id, asset_id):
    # NOTE: the documented path is /releases/assets/{asset_id} - the asset id is
    # NOT nested under a release id. /releases/{release_id}/assets/{asset_id}
    # returns 404.
    url = f"{API}/repos/{OWNER_REPO}/releases/assets/{asset_id}"
    _request(url, method="DELETE")
    print(f"deleted asset {asset_id}")


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    cmd, release_id = argv[1], argv[2]
    if cmd == "list":
        list_assets(release_id)
    elif cmd == "upload" and len(argv) == 5:
        upload_asset(release_id, argv[3], argv[4])
    elif cmd == "delete" and len(argv) == 4:
        delete_asset(release_id, argv[3])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
