'use client';

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ZoneLayer from './ZoneLayer';

// Fix for default marker icons missing in Leaflet + Next.js build
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

export interface CivicMapProps {
  lat: number;
  lng: number;
  complaints?: { lat: number; lng: number; title: string; category: string; status: string }[];
}

export default function CivicMap({ lat, lng, complaints = [] }: CivicMapProps) {
  useEffect(() => {
    // Overriding default icon
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl,
      iconUrl,
      shadowUrl,
    });
  }, []);

  return (
    <MapContainer 
      key={`${lat}-${lng}`}
      center={[lat, lng]} 
      zoom={14} 
      style={{ height: '100%', width: '100%' }}
      // Enable scrolling so user can zoom easily
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      
      {/* Existing Marker (Preserved focus) */}
      <Marker position={[lat, lng]}>
        <Popup>Focused Civic Issue</Popup>
      </Marker>

      {/* New Zone Layer (GeoJSON) added harmlessly alongside the marker */}
      <ZoneLayer />

      {/* Draw circular heat blobs for all complaints */}
      {complaints.map((complaint, i) => {
        // Red for Critical, Blue/Orange for progress, Green for Resolved
        let color = '#ef4444'; // default red
        if (complaint.status === 'RESOLVED') color = '#22c55e'; // green
        else if (complaint.status === 'SCHEDULED' || complaint.status === 'IN PROGRESS') color = '#3b82f6'; // blue
        
        return (
          <Circle 
            key={`heat-${i}`}
            center={[complaint.lat, complaint.lng]} 
            radius={180} 
            pathOptions={{ 
              fillColor: color, 
              color: color, 
              weight: 0, 
              fillOpacity: 0.35 
            }}
          >
            <Popup>
              <strong>{complaint.title}</strong><br/>
              Status: {complaint.status}
            </Popup>
          </Circle>
        );
      })}
    </MapContainer>
  );
}
