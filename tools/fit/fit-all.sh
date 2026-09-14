#!/usr/bin/env bash
# Fit every character that has a reference image, one after another, with no AI involved.
#
#   tools/fit/fit-all.sh                 # every tools/fit/refs/<who>.png
#   tools/fit/fit-all.sh king queen      # just these
#   ITERS=1000 JOBS=2 tools/fit/fit-all.sh
#
# Reference files are tools/fit/refs/<who>.png (or .jpg): a front view on a plain background.
# Names: king queen king_mounted archer swordsman raider elite brute boss
set -u
cd "$(dirname "$0")/../.."
BLENDER="${BLENDER:-/opt/homebrew/bin/blender}"
ITERS="${ITERS:-2500}"; TARGET="${TARGET:-0.8}"; JOBS="${JOBS:-4}"
if [ $# -gt 0 ]; then names="$*"; else names=$(ls tools/fit/refs 2>/dev/null | grep -v '^_' | grep -E '^(king|queen|king_mounted|archer|swordsman|raider|elite|brute|boss)\.(png|jpg|jpeg)$' | sed -E 's/\.(png|jpg|jpeg)$//' | sort -u); fi
[ -z "$names" ] && { echo "No references found. Put front-view images in tools/fit/refs/<who>.png"; exit 1; }
summary=()
for who in $names; do
  ref=$(ls tools/fit/refs/"$who".{png,jpg,jpeg} 2>/dev/null | head -1)
  [ -z "$ref" ] && { summary+=("$who: no reference"); continue; }
  echo "=== $who  ($ref) ==="
  "$BLENDER" -b -P tools/fit/fit.py -- "$who" "$ref" --iters "$ITERS" --target "$TARGET" --jobs "$JOBS" 2>&1 | grep -E "^(seeds|  |best seed|colours|complete|stalled|reference|Traceback|[A-Za-z]*Error)"
  summary+=("$who: $(tail -1 tools/fit/reports/_"$who".verdict 2>/dev/null || echo 'see above')")
done
echo; echo "=== summary ==="; printf '%s\n' "${summary[@]}"
echo "Reports: tools/fit/reports/<who>.png   Params: tools/fit/params/<who>.json"
echo "Rebuild the game's models to use them:  for c in $names; do blender -b -P tools/blender/make_character.py -- \$c public/models/\$c.glb; done"
