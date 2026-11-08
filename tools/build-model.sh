#!/usr/bin/env bash
# Rebuild docs/models/sponza.glb from the original Crytek Sponza OBJ.
# Requires: node, python3 + Pillow. Run from the repo root: ./tools/build-model.sh
set -euo pipefail

WORK="${WORK:-$(mktemp -d)}"
SRC=https://raw.githubusercontent.com/jimmiebergmann/Sponza/master
echo "Working in $WORK"
mkdir -p "$WORK/src/textures"
cd "$WORK/src"

# 1. Download the OBJ, MTL and diffuse textures (normal maps and missing masks are skipped).
curl -fsSLO "$SRC/sponza.obj"
curl -fsSLO "$SRC/sponza.mtl"
for t in $(grep -h 'map_Kd ' sponza.mtl | awk '{print $2}' | sort -u); do
  curl -fsSL -o "$t" "$SRC/$t"
done

# 2. Clean the MTL: drop bump/mask maps, fix "d 0" (would make everything invisible),
#    and convert TGA -> PNG (glTF can't carry TGA).
sed -i -e '/map_d /d' -e '/map_Disp /d' -e 's/^d 0.000000/d 1.000000/' -e 's/\.tga/.png/' sponza.mtl
python3 -I - textures <<'PY'
import os, sys
from PIL import Image
d = sys.argv[1]
for f in os.listdir(d):
    if f.endswith('.tga'):
        im = Image.open(os.path.join(d, f))
        if im.mode == 'RGBA' and im.getextrema()[3][0] == 255:
            im = im.convert('RGB')
        im.save(os.path.join(d, f[:-4] + '.png'))
PY

# 3. OBJ -> GLB, then optimise.
cd "$WORK"
npm init -y >/dev/null
npm install --silent obj2gltf @gltf-transform/cli sharp
npx obj2gltf -i src/sponza.obj -o sponza-raw.glb --checkTransparency
npx gltf-transform optimize sponza-raw.glb sponza.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify true --simplify-ratio 0.5 --simplify-error 0.0005 \
  --join true --instance false

cd - >/dev/null
cp "$WORK/sponza.glb" docs/models/sponza.glb
ls -lh docs/models/sponza.glb
