import React, { useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import type { PathOptions, Layer } from 'leaflet';

// Import our static valid GeoJSON data
import zonesData from '../../data/zones.json';

interface ZoneLayerProps {
  /** Optional lookup mapping zone IDs or names to issue counts for density color mapping */
  issueCountsByZone?: Record<string, number>;
}

export default function ZoneLayer({ issueCountsByZone }: ZoneLayerProps) {
  // Memoize the base GeoJSON to prevent re-renders when map interacts
  const geoJsonData = useMemo(() => zonesData as FeatureCollection, []);

  // Provide interactive popup bindings
  const onEachFeature = (feature: Feature<Geometry, any>, layer: Layer) => {
    if (feature.properties && feature.properties.name) {
      // Show zone name in popup when clicked
      let popupContent = `<strong>${feature.properties.name}</strong>`;
      
      const zoneId = feature.properties.id;
      if (issueCountsByZone && zoneId && issueCountsByZone[zoneId]) {
        popupContent += `<br/>Active Issues: ${issueCountsByZone[zoneId]}`;
      }

      layer.bindPopup(popupContent);
    }
  };

  // Dynamically style the polygons. Can adjust based on density if provided.
  const styleFeature = (feature: Feature<Geometry, any> | undefined): PathOptions => {
    let fillColor = '#7c3aed'; // Default purple
    
    // Optional Density coloring
    if (feature && issueCountsByZone && feature.properties?.id) {
      const count = issueCountsByZone[feature.properties.id] || 0;
      if (count > 10) fillColor = 'red';
      else if (count > 5) fillColor = 'orange';
      else if (count > 0) fillColor = 'green';
    }

    return {
      color: '#7c3aed',     // Outline color
      weight: 2,            // Outline thickness
      fillColor: fillColor, // Fill color inside the polygon
      fillOpacity: 0.08,    // Low opacity so map and markers underneath are visible
    };
  };

  return (
    <GeoJSON
      data={geoJsonData}
      style={styleFeature}
      onEachFeature={onEachFeature}
      // Places zones in a pane below interactive markers so they don't block marker clicks
      // Leaflet inherently controls this via MapPanes, but 'overlayPane' is usually default.
      // Ensuring non-blocking interactions:
      pane="overlayPane"
    />
  );
}
