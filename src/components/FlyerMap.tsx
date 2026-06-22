"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { StoreSearch, type SearchableStore } from "./StoreSearch";
import { FlyerViewer } from "./FlyerViewer";
import styles from "./FlyerMap.module.css";

// A pin in the "matsu" pine-green accent, replacing Leaflet's default blue
// teardrop. Inlined as an SVG data URI rather than a static asset import —
// Next.js/Turbopack resolves *.png imports from node_modules to plain string
// URLs (not StaticImageData), which previously caused a runtime crash when
// accessed via `.src`; an inline SVG sidesteps the asset-import path entirely.
const STORE_ICON = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 9.8 14 24 14 24s14-14.2 14-24c0-7.7-6.3-14-14-14z" fill="#2D5A4A"/>
        <circle cx="14" cy="14" r="5.5" fill="#FAFAF7"/>
      </svg>`,
    ),
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
});

interface Store extends SearchableStore {
  tokubaiStoreId: string;
  lat: number | null;
  lng: number | null;
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

const MOBILE_BREAKPOINT_PX = 768;

export function FlyerMap() {
  const [stores, setStores] = useState<Store[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((data: Store[]) => setStores(data));
  }, []);

  const geocodedStores = useMemo(() => stores.filter((s) => s.lat !== null && s.lng !== null), [stores]);
  const visibleStores = geocodedStores.filter((s) => matchedIds.has(s.id));
  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;

  return (
    <div className={styles.wrapper}>
      <div className={styles.searchBar}>
        <StoreSearch stores={geocodedStores} onMatchesChange={setMatchedIds} />
      </div>
      <MapContainer center={[35.6895, 139.6917]} zoom={10} className={styles.map}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MarkerClusterGroup>
          {visibleStores.map((store) => (
            <Marker
              key={store.id}
              position={[store.lat as number, store.lng as number]}
              icon={STORE_ICON}
              eventHandlers={{ click: () => setActiveStoreId(store.id) }}
            >
              {!isMobile && (
                <Popup>
                  <div className={styles.popupContent}>
                    <FlyerViewer storeName={store.name} flyers={store.flyers} />
                  </div>
                </Popup>
              )}
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      {isMobile && activeStore && (
        <div data-testid="flyer-panel" className={styles.panel}>
          <div className={styles.panelHeader}>
            <button
              className={styles.closeButton}
              onClick={() => setActiveStoreId(null)}
              aria-label="閉じる"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <FlyerViewer storeName={activeStore.name} flyers={activeStore.flyers} />
        </div>
      )}
    </div>
  );
}
