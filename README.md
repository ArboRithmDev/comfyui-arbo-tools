# Arbo Tools

Custom utility nodes for ComfyUI.

![Version](https://img.shields.io/badge/version-0.6.0-blueviolet)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)

## Nodes

### Load Image (Optional)
Image loader with a **"none"** option. When no image is selected, emits an empty signal that passes safely through intermediate nodes (resize, sharpen, etc.) instead of crashing.

### Merge Images (Optional)
Merges up to 5 image sources — all optional. Automatically filters out:
- Empty signals from Load Image (Optional)
- Fully black images
- Unconnected inputs

Blocks downstream execution only when **all** inputs are empty.

### Join Text List
Combines a list of strings into a single text. Handles both list and single string inputs — useful after batch nodes like Florence2 that return one caption per image.

- Configurable separator (default: `, `)
- Deduplicates phrases by default

## Installation

Clone into your ComfyUI custom nodes directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ArboRithmDev/comfyui-arbo-tools.git
```

Restart ComfyUI. Nodes appear in the `image` and `text` categories.

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
