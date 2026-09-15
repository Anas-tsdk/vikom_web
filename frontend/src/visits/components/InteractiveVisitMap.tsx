import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MappedVisit {
  id: number;
  patientName: string;
  address: string;
  date: string;
  time: string;
  latitude?: number | null;
  longitude?: number | null;
  sequence?: number;
}

interface InteractiveVisitMapProps {
  visits: MappedVisit[];
  selectedVisitId: number | null;
  onSelect: (visitId: number) => void;
  noLocationsText: string;
  appointmentText: (index: number) => string;
  routeCoordinates?: [number, number][];
  origin?: { latitude: number; longitude: number } | null;
  originText: string;
}

const InteractiveVisitMap: React.FC<InteractiveVisitMapProps> = ({
  visits,
  selectedVisitId,
  onSelect,
  noLocationsText,
  appointmentText,
  routeCoordinates = [],
  origin,
  originText,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<number, L.Marker>());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([59.9139, 10.7522], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, []);

  // The planning workspace now follows the monitor height. Tell Leaflet when
  // its flex-sized container changes so tiles and click coordinates stay
  // aligned after a window resize or browser zoom change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => mapRef.current?.invalidateSize({ pan: false }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    const bounds: L.LatLngExpression[] = [];

    if (routeCoordinates.length > 1) {
      L.polyline(routeCoordinates, {
        color: '#1d4ed8',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layer);
      bounds.push(...routeCoordinates);
    }

    if (origin) {
      const originPoint: L.LatLngExpression = [origin.latitude, origin.longitude];
      bounds.push(originPoint);
      L.circleMarker(originPoint, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#198754',
        fillOpacity: 1,
      }).bindTooltip(originText).addTo(layer);
    }

    visits.forEach((visit, index) => {
      if (typeof visit.latitude !== 'number' || typeof visit.longitude !== 'number') return;
      const point: L.LatLngExpression = [visit.latitude, visit.longitude];
      bounds.push(point);
      const icon = L.divIcon({
        className: 'planning-map-marker-wrapper',
        html: `<span class="planning-map-marker">${visit.sequence ?? index + 1}</span>`,
        iconSize: [34, 42],
        iconAnchor: [17, 42],
      });
      const marker = L.marker(point, { icon }).addTo(layer);
      const popup = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${visit.sequence ?? index + 1}. ${visit.patientName}`;
      const address = document.createElement('div');
      address.textContent = visit.address;
      const time = document.createElement('div');
      time.textContent = `${visit.date} ${visit.time}`;
      popup.append(title, address, time);
      marker.bindPopup(popup);
      marker.on('click', () => onSelect(visit.id));
      markersRef.current.set(visit.id, marker);
    });

    if (bounds.length === 1) map.setView(bounds[0], 15);
    else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 15 });
  }, [visits, onSelect, origin, originText, routeCoordinates]);

  useEffect(() => {
    if (selectedVisitId === null) return;
    const marker = markersRef.current.get(selectedVisitId);
    if (marker) {
      mapRef.current?.panTo(marker.getLatLng());
      marker.openPopup();
    }
  }, [selectedVisitId]);

  const mappedCount = visits.filter((visit) => typeof visit.latitude === 'number' && typeof visit.longitude === 'number').length;
  return (
    <div className="planning-map-shell">
      <div ref={containerRef} className="planning-map" role="region" aria-label={appointmentText(mappedCount)} />
      {mappedCount === 0 && <div className="planning-map-empty">{noLocationsText}</div>}
    </div>
  );
};

export default InteractiveVisitMap;
