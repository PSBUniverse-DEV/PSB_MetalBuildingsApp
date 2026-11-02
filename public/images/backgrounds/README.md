# 3D Viewer Backgrounds ("Change background")

Drop background photos here to replace the procedural scenes offered by the
3D building preview's **Change background** toolbar button
(`src/modules/metal-buildings/pages/BuildingPreviewV2.jsx`).

## File names (one per preset)

| File | Replaces preset | Notes |
|------|-----------------|-------|
| `backyard.jpg` | Backyard | sky + green field |
| `farm.jpg` | Farm | warm sky + golden field |
| `basic-gray.jpg` | Basic Gray | optional (solid gray otherwise) |
| `sky.jpg` | Sky | optional (gradient otherwise) |
| `dark.jpg` | Dark | optional (solid dark otherwise) |

`Default` is always the plain app background — no file needed.

## Specs

- Format: JPG (PNG also works; keep the `.jpg` filename or update the
  extension in `BG_PRESETS`).
- Size: 1920x1080 (16:9) recommended.
- The image is used as the 3D scene backdrop AND as the dropdown thumbnail.

Until a file exists, the preset renders its built-in procedural version, so
the feature works with zero assets.
