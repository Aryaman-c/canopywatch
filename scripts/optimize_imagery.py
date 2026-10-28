"""Create full-resolution WebP browser imagery from the existing manifest's PNGs."""
import json
from pathlib import Path
from PIL import Image


def save_browser_image(image, output, period):
    # Keep every source pixel and the no-data alpha mask; compress RGB at high quality.
    destination = output / f'{period}.webp'
    image.save(destination, format='WEBP', quality=92, method=6)
    return f'/imagery/{destination.name}'


if __name__ == '__main__':
    output = Path(__file__).resolve().parents[1] / 'public/imagery'
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for period, raster in manifest.items():
        source = output / f'{period}.png'
        with Image.open(source) as image:
            raster['url'] = save_browser_image(image, output, period)
        destination = output / f'{period}.webp'
        print(f'{period}: {source.stat().st_size:,} -> {destination.stat().st_size:,} bytes', flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
