#!/usr/bin/env bash
#
# Release a PXT extension: set the version in pxt.json, commit, tag vX.Y.Z and
# push. MakeCode resolves extension versions from GitHub tags.
#
# Usage: ./release.sh <major|minor|patch|X.Y.Z>

set -euo pipefail

cd "$(dirname "$0")"

BRANCH="main"
REMOTE="origin"

die() {
    echo "error: $*" >&2
    exit 1
}

[ $# -eq 1 ] || die "usage: $0 <major|minor|patch|X.Y.Z>"

command -v git >/dev/null || die "git not found"
command -v python3 >/dev/null || die "python3 not found"

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "must be on $BRANCH"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"

git fetch --quiet "$REMOTE" "$BRANCH" --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$REMOTE/$BRANCH")" ] \
    || die "local $BRANCH differs from $REMOTE/$BRANCH (pull or push first)"

CURRENT=$(python3 -c 'import json; print(json.load(open("pxt.json"))["version"])')

case "$1" in
    major|minor|patch)
        NEXT=$(python3 - "$CURRENT" "$1" <<'EOF'
import sys
major, minor, patch = map(int, sys.argv[1].split("."))
kind = sys.argv[2]
if kind == "major":
    major, minor, patch = major + 1, 0, 0
elif kind == "minor":
    minor, patch = minor + 1, 0
else:
    patch += 1
print(f"{major}.{minor}.{patch}")
EOF
)
        ;;
    *)
        NEXT="$1"
        ;;
esac

[[ "$NEXT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be X.Y.Z, got '$NEXT'"
TAG="v$NEXT"

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"

echo "Releasing $CURRENT -> $NEXT ($TAG)"
read -r -p "Continue? [y/N] " REPLY
[[ "$REPLY" =~ ^[Yy]$ ]] || die "aborted"

# Rewrite only the version line so the file's formatting is preserved
python3 - "$NEXT" <<'EOF'
import re, sys
text = open("pxt.json").read()
text, n = re.subn(r'("version"\s*:\s*")[^"]*(")', r'\g<1>' + sys.argv[1] + r'\g<2>', text, count=1)
if n != 1:
    sys.exit("could not find version in pxt.json")
open("pxt.json", "w").write(text)
EOF

git add pxt.json
git commit -m "Release $TAG"
git tag -a "$TAG" -m "Release $TAG"
git push "$REMOTE" "$BRANCH"
git push "$REMOTE" "$TAG"

echo "Released $TAG"
