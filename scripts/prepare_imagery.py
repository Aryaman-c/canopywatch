"""Convert RGB TIFFs or ZIPs, retaining imagery for other existing dates."""
import argparse
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.tools/python'))
import json
import zipfile
import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds
from PIL import Image
from optimize_imagery import save_browser_image

root = Path(__file__).resolve().parents[1]
output = root / 'public/imagery'
output.mkdir(parents=True, exist_ok=True)
manifest_path = output / 'manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inputs', nargs='+', type=Path, help='RGB TIFFs or export ZIPs')
parser.add_argument('--months', nargs='+', type=int, choices=range(1, 13), help='Only convert these calendar months')
args = parser.parse_args()


def convert(source, filename):
    match = re.fullmatch(r'forest_rgb_(\d{4}-(?:0[1-9]|1[0-2]))', Path(filename).stem)
    if not match or source.count != 3 or source.crs is None:
        raise ValueError(f'Expected georeferenced forest_rgb_YYYY-MM RGB TIFF: {filename}')
    period = match.group(1)
    if args.months and int(period[-2:]) not in args.months:
        return
    projection, width, height = calculate_default_transform(source.crs, 'EPSG:3857', source.width, source.height, *source.bounds)
    rgb = np.zeros((3, height, width), dtype=np.uint8)
    for band in range(3):
        reproject(source=rasterio.band(source, band + 1), destination=rgb[band], src_transform=source.transform, src_crs=source.crs, src_nodata=source.nodata, dst_transform=projection, dst_crs='EPSG:3857', dst_nodata=0, resampling=Resampling.nearest)
    mask = np.zeros((height, width), dtype=np.uint8)
    reproject(source=source.dataset_mask(), destination=mask, src_transform=source.transform, src_crs=source.crs, dst_transform=projection, dst_crs='EPSG:3857', resampling=Resampling.nearest)
    image = np.dstack([rgb.transpose(1, 2, 0), mask])
    browser_image = Image.fromarray(image)
    browser_image.save(output / f'{period}.png', optimize=True)
    browser_url = save_browser_image(browser_image, output, period)
    west, south, east, north = transform_bounds('EPSG:3857', 'EPSG:4326', projection.c, projection.f + projection.e * height, projection.c + projection.a * width, projection.f)
    manifest[period] = {'url': browser_url, 'coordinates': [[west, north], [east, north], [east, south], [west, south]], 'width': width, 'height': height, 'validPercent': round(float(np.count_nonzero(mask)) / mask.size * 100, 1)}
    print(period, source.crs, source.nodata, width, height, manifest[period]['validPercent'], flush=True)


for path in args.inputs:
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                if entry.is_dir() or not entry.filename.lower().endswith(('.tif', '.tiff')):
                    continue
                with rasterio.MemoryFile(archive.read(entry)) as memory, memory.open() as source:
                    convert(source, entry.filename)
    else:
        with rasterio.open(path) as source:
            convert(source, path.name)
manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + '\n')
