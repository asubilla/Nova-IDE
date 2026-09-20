#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$ROOT_DIR/release"

echo "=== Nova IDE Build ==="
echo "Root: $ROOT_DIR"

echo ""
echo "── Cleaning dist/ ──"
if [ -d "$DIST_DIR" ]; then
  rm -rf "$DIST_DIR"
  echo "Removed dist/"
fi
mkdir -p "$DIST_DIR"
echo "Created dist/"

echo ""
echo "── Compiling TypeScript ──"
cd "$ROOT_DIR"
npx tsc --project tsconfig.build.json
echo "TypeScript compilation complete."

echo ""
echo "── Copying non-TS files ──"
copy_non_ts() {
  local src="$1"
  local dest="$2"
  if [ -d "$src" ]; then
    find "$src" -type f \
      \( -name "*.json" -o -name "*.html" -o -name "*.css" -o -name "*.js" \
         -o -name "*.png" -o -name "*.svg" -o -name "*.ico" -o -name "*.woff" \
         -o -name "*.woff2" -o -name "*.ttf" -o -name "*.eot" \) | while read -r file; do
      rel="${file#$src/}"
      dir="$(dirname "$dest/$rel")"
      mkdir -p "$dir"
      cp "$file" "$dest/$rel"
    done
    echo "Copied non-TS files from $src"
  fi
}

for dir in web templates agents artifacts; do
  if [ -d "$ROOT_DIR/$dir" ]; then
    cp -r "$ROOT_DIR/$dir" "$DIST_DIR/"
    echo "Copied $dir/"
  fi
done

echo ""
echo "── Creating release artifacts ──"
mkdir -p "$RELEASE_DIR"

cp "$ROOT_DIR/package.json" "$RELEASE_DIR/"
cp "$ROOT_DIR/package-lock.json" "$RELEASE_DIR/" 2>/dev/null || true

cd "$RELEASE_DIR"
npm pack --pack-destination "$RELEASE_DIR" 2>/dev/null || echo "npm pack skipped (no registry configured)"

echo ""
echo "── Build Summary ──"
echo "  dist/     : $DIST_DIR"
echo "  release/  : $RELEASE_DIR"

if [ -f "$DIST_DIR/index.js" ]; then
  echo "  Status    : Build successful"
else
  echo "  Status    : Build may have issues (dist/index.js not found)"
  exit 1
fi

echo ""
echo "=== Build Complete ==="
