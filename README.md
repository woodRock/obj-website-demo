# Sponza Orbit

A big, freely licensed building OBJ, compressed for the web and rendered in the browser with three.js.
Scroll (or swipe on a phone) and the camera orbits horizontally around the building.

## What's here

| | Size |
|---|---|
| Source `sponza.obj` (262,267 faces) | 23 MB |
| Source textures (TGA) | 98 MB |
| Unoptimised GLB (after `obj2gltf`) | 69 MB |
| **`models/sponza.glb` served to the browser** | **5.7 MB** |

The pipeline (`tools/build-model.sh`):

1. Download the OBJ, MTL and diffuse textures.
2. Clean the MTL and convert TGA → PNG.
3. `obj2gltf` → GLB.
4. `gltf-transform optimize`: dedupe, join and weld meshes, simplify to about 143k triangles, quantize,
   meshopt-compress the geometry, and resize textures to 1024 px WebP.

## Interaction

- **Scroll / vertical swipe:** scrolling the whole page turns the camera one full revolution. The camera follows with damping, so it moves smoothly.
- **Horizontal drag (mouse or touch):** spins the building directly. The canvas uses `touch-action: pan-y`, so vertical swipes still scroll the page on mobile.
- The roof fades out early in the scroll, giving a cutaway view down into the arcades.
- Camera distance is computed from the viewport's field of view, so the whole building fits on portrait phones as well as wide desktops.

## Run locally

It's a static site with no build step. three.js is vendored in `vendor/`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## GitHub Pages

`.github/workflows/pages.yml` publishes the repo root to GitHub Pages on every push to the default branch.
It's live at **https://woodrock.github.io/obj-website-demo/**.

If the first deploy fails with a "Pages site not found" error, open **Settings → Pages**, set
**Source** to **GitHub Actions**, and re-run the workflow.

## Credits

- **Crytek Sponza** by Frank Meinl, Crytek. Licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  OBJ from [jimmiebergmann/Sponza](https://github.com/jimmiebergmann/Sponza), a fixed version of the model in
  Morgan McGuire's [Computer Graphics Archive](https://casual-effects.com/data/).
- **three.js** r170 (MIT), vendored in `vendor/three/`.
