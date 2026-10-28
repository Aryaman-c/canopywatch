// SETTINGS — Wayanad, Western Ghats, Kerala, India
var comparisonYears = [2025, 2026];
// In the Western Ghats, the SW monsoon brings heavy cloud cover from June to September.
// December and January provide clear skies (<10% cloud) for high-quality Sentinel-2 observations.
var months = [12, 1]; // December, January

var detectionRadiusKm = 20; // 20 km coverage centered around Wayanad forest ridges & plantation zones.
var area = ee.Geometry.Point([76.132, 11.685]) // Wayanad, Western Ghats, Kerala, India
  .buffer(detectionRadiusKm * 1000); // Earth Engine buffer distance is in meters.
var analysisCRS = 'EPSG:32643'; // UTM Zone 43N for Western Ghats / Kerala.

// Keep your current detection thresholds.
var baselineThreshold = 0.6;
var laterThreshold = 0.5;
var minimumDrop = 0.3;

// 0 preserves all patches. Try 0.1 to exclude tiny patches.
var minimumAreaHectares = 0;

var dynamicWorld = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterBounds(area);

var patchCollections = [];

Map.centerObject(area, 10);

// Create a monthly tree-probability composite.
// The masked fallback lets empty months remain missing data.
function monthlyTrees(start) {
  var scenes = dynamicWorld
    .filterDate(start, start.advance(1, 'month'))
    .select('trees')
    .map(function(image) {
      return image.toFloat();
    });

  var empty = ee.Image.constant(0)
    .rename('trees')
    .updateMask(ee.Image.constant(0))
    .toFloat();

  return ee.ImageCollection.fromImages([empty])
    .merge(scenes)
    .median()
    .clip(area);
}

comparisonYears.forEach(function(year) {
  months.forEach(function(month) {
    var baselineStart = ee.Date.fromYMD(year - 1, month, 1);
    var comparisonStart = ee.Date.fromYMD(year, month, 1);

    var baselineScenes = dynamicWorld.filterDate(
      baselineStart,
      baselineStart.advance(1, 'month')
    );

    var comparisonScenes = dynamicWorld.filterDate(
      comparisonStart,
      comparisonStart.advance(1, 'month')
    );

    var before = monthlyTrees(baselineStart);
    var after = monthlyTrees(comparisonStart);
    var drop = before.subtract(after);

    var candidateLoss = before.gt(baselineThreshold)
      .and(after.lt(laterThreshold))
      .and(drop.gt(minimumDrop));

    var monthText = month < 10 ? '0' + month : '' + month;
    var baselinePeriod = (year - 1) + '-' + monthText;
    var comparisonPeriod = year + '-' + monthText;
    var comparisonId = baselinePeriod + '_to_' + comparisonPeriod;

    Map.addLayer(
      candidateLoss.selfMask(),
      {palette: ['yellow']},
      comparisonId,
      false
    );

    print(comparisonId + ' scene counts:', ee.Dictionary({
      baseline: baselineScenes.size(),
      comparison: comparisonScenes.size()
    }));

    var patches = candidateLoss.selfMask()
      .toByte()
      .reduceToVectors({
        geometry: area,
        scale: 10,
        crs: analysisCRS,
        geometryType: 'polygon',
        eightConnected: true,
        labelProperty: 'loss',
        reducer: ee.Reducer.countEvery(),
        maxPixels: 1e8
      });

    patches = patches.map(function(patch) {
      return patch.set({
        area_hectares: patch.geometry().area(1).divide(10000),
        baseline_period: baselinePeriod,
        comparison_period: comparisonPeriod,
        comparison_year: year,
        comparison_month: month,
        comparison_id: comparisonId,
        baseline_scene_count: baselineScenes.size(),
        comparison_scene_count: comparisonScenes.size(),
        status: 'candidate_tree_loss'
      });
    }).filter(
      ee.Filter.gte('area_hectares', minimumAreaHectares)
    );

    patchCollections.push(patches);
  });
});

// Combine the comparisons into one export.
var allPatches = ee.FeatureCollection(patchCollections).flatten();

Export.table.toDrive({
  collection: allPatches,
  description: 'forest_loss_multiple_periods',
  folder: 'ForestMonitor',
  fileNamePrefix: 'forest_loss_multiple_periods',
  fileFormat: 'GeoJSON'
});


// Same rectangular extent and 10 m grid for every export.
var imageryRegion = area.bounds();
var imageryCRS = 'EPSG:32643'; // Wayanad, Western Ghats, India (UTM Zone 43N)
var imageryGrid = [10, 0, 0, 0, -10, 10000000];

var imageryMonths = [
  '2023-12', '2024-01',
  '2024-12', '2025-01',
  '2025-12', '2026-01'
];

// Mask cloud shadows, clouds, cirrus, snow and invalid pixels.
function maskImagery(image) {
  var scl = image.select('SCL');

  var clear = scl.neq(0)
    .and(scl.neq(1))
    .and(scl.neq(3))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  return image.updateMask(clear).select(['B4', 'B3', 'B2']);
}

imageryMonths.forEach(function(month) {
  var start = ee.Date(month + '-01');
  var end = start.advance(1, 'month');

  var scenes = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(imageryRegion)
    .filterDate(start, end);

  print(month + ' imagery scene count:', scenes.size());

  var composite = scenes
    .map(maskImagery)
    .median()
    .clip(imageryRegion);

  // Use the same brightness settings for every month.
  var rgb = composite.visualize({
    bands: ['B4', 'B3', 'B2'],
    min: 0,
    max: 3000,
    gamma: 1.2
  });

  Map.addLayer(rgb, {}, 'Imagery ' + month, false);

  Export.image.toDrive({
    image: rgb.toInt16().unmask(-9999),
    description: 'forest_rgb_' + month.replace('-', '_'),
    folder: 'ForestMonitorImagery',
    fileNamePrefix: 'forest_rgb_' + month,
    region: imageryRegion,
    crs: imageryCRS,
    crsTransform: imageryGrid,
    maxPixels: 1e9,
    fileFormat: 'GeoTIFF',
    formatOptions: {
      cloudOptimized: true,
      noData: -9999
    }
  });
});
