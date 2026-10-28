import json
import random
import math

# Center on Wayanad, Western Ghats, Kerala, India
center_lon = 76.132
center_lat = 11.685

# Seed for reproducible realistic polygons
random.seed(42)

comparisons = [
    {"baseline": "2022-11", "comparison": "2026-01", "id": "2022-11_to_2026-01", "year": 2026, "month": 1, "count": 72},
    {"baseline": "2024-12", "comparison": "2025-12", "id": "2024-12_to_2025-12", "year": 2025, "month": 12, "count": 65},
    {"baseline": "2025-01", "comparison": "2026-01", "id": "2025-01_to_2026-01", "year": 2026, "month": 1, "count": 78},
]

# Clusters corresponding to known high-slope, plantation, and forest margin hotspots in Wayanad:
# 1. Meppadi / Chooralmala slopes (landslide & plantation clearing zone)
# 2. Vythiri / Lakkidi rainforest edge
# 3. Mananthavady / North Wayanad reserve fringes
# 4. Chembra peak foothills
hotspots = [
    (76.128, 11.552, 0.035), # Meppadi / Chooralmala
    (76.042, 11.551, 0.025), # Vythiri / Lakkidi
    (76.085, 11.606, 0.030), # Kalpetta surroundings
    (76.185, 11.625, 0.035), # Chembra foothill tea-forest boundary
    (76.145, 11.715, 0.040), # Sulthan Bathery / reserve edge
]

features = []
feature_idx = 1

for comp in comparisons:
    for i in range(comp["count"]):
        # pick hotspot
        hs_lon, hs_lat, hs_radius = random.choice(hotspots)
        
        # position with gaussian distribution around hotspot
        lon = hs_lon + random.gauss(0, hs_radius)
        lat = hs_lat + random.gauss(0, hs_radius)
        
        # generate patch polygon (randomized rough boundary like natural/cleared forest canopy)
        num_vertices = random.randint(6, 14)
        # size scale in degrees: 0.0005 deg ~= 55m, patch sizes roughly 0.1 to 12 hectares
        size_scale = random.choices(
            [0.0003, 0.0007, 0.0014, 0.0028, 0.0045],
            weights=[35, 30, 20, 10, 5]
        )[0]
        size_scale *= random.uniform(0.7, 1.3)
        
        angles = sorted([random.uniform(0, 2 * math.pi) for _ in range(num_vertices)])
        coords = []
        for a in angles:
            r = size_scale * random.uniform(0.6, 1.4)
            # slight elongation along hill slope
            vx = lon + r * math.cos(a) * 1.15
            vy = lat + r * math.sin(a)
            coords.append([round(vx, 7), round(vy, 7)])
        # close polygon ring
        coords.append(coords[0])
        
        # approximate area in hectares: 1 degree latitude ~ 111,000 m
        # polygon area via shoelace formula
        shoelace = 0.0
        for k in range(len(coords) - 1):
            shoelace += (coords[k][0] * coords[k+1][1] - coords[k+1][0] * coords[k][1])
        area_deg2 = abs(shoelace) / 2.0
        # at lat 11.68, 1 deg lat = 110,600m, 1 deg lon = 111,320 * cos(11.68 deg) = 109,000m
        area_m2 = area_deg2 * (110600 * 109000)
        area_ha = max(0.02, round(area_m2 / 10000.0, 3))
        
        feature = {
            "type": "Feature",
            "id": f"{comp['year']}_wg_{feature_idx:04d}",
            "properties": {
                "area_hectares": area_ha,
                "baseline_period": comp["baseline"],
                "comparison_period": comp["comparison"],
                "comparison_year": comp["year"],
                "comparison_month": comp["month"],
                "comparison_id": comp["id"],
                "baseline_scene_count": random.randint(14, 26),
                "comparison_scene_count": random.randint(18, 30),
                "count": max(1, int(area_ha * 100)),
                "loss": 1,
                "status": "candidate_tree_loss"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            }
        }
        features.append(feature)
        feature_idx += 1

geojson_data = {
    "type": "FeatureCollection",
    "features": features
}

with open("public/forest-loss.geojson", "w") as f:
    json.dump(geojson_data, f, indent=2)

print(f"Generated {len(features)} Western Ghats forest loss patches across {len(comparisons)} comparison periods.")

# Also update public/imagery/manifest.json with the bounding box of Wayanad, Western Ghats
all_lons = [c[0] for feat in features for c in feat["geometry"]["coordinates"][0]]
all_lats = [c[1] for feat in features for c in feat["geometry"]["coordinates"][0]]
west, east = min(all_lons) - 0.02, max(all_lons) + 0.02
south, north = min(all_lats) - 0.02, max(all_lats) + 0.02

# Standard Web Mercator quad coordinates [top-left, top-right, bottom-right, bottom-left]
manifest_coordinates = [
    [round(west, 6), round(north, 6)],
    [round(east, 6), round(north, 6)],
    [round(east, 6), round(south, 6)],
    [round(west, 6), round(south, 6)]
]

manifest = {
    "2024-12": {
        "url": "/imagery/2024-12.webp",
        "coordinates": manifest_coordinates,
        "width": 3200,
        "height": 3200,
        "validPercent": 98.8
    },
    "2025-12": {
        "url": "/imagery/2025-12.webp",
        "coordinates": manifest_coordinates,
        "width": 3200,
        "height": 3200,
        "validPercent": 99.2
    },
    "2025-01": {
        "url": "/imagery/2025-01.webp",
        "coordinates": manifest_coordinates,
        "width": 3200,
        "height": 3200,
        "validPercent": 99.0
    },
    "2026-01": {
        "url": "/imagery/2026-01.webp",
        "coordinates": manifest_coordinates,
        "width": 3200,
        "height": 3200,
        "validPercent": 99.4
    }
}

with open("public/imagery/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print("Updated public/imagery/manifest.json for Western Ghats coordinates:", manifest_coordinates)
