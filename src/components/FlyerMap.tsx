"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import { StoreSearch, type SearchableStore } from "./StoreSearch";
import { FlyerViewer } from "./FlyerViewer";

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
    <div>
      <StoreSearch stores={geocodedStores} onMatchesChange={setMatchedIds} />
      <MapContainer center={[35.6895, 139.6917]} zoom={10} style={{ height: "80vh", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MarkerClusterGroup>
          {visibleStores.map((store) => (
            <Marker
              key={store.id}
              position={[store.lat as number, store.lng as number]}
              eventHandlers={{ click: () => setActiveStoreId(store.id) }}
            >
              {!isMobile && activeStoreId === store.id && (
                <Popup>
                  <FlyerViewer storeName={store.name} flyers={store.flyers} />
                </Popup>
              )}
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      {isMobile && activeStore && (
        <div
          data-testid="flyer-panel"
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", padding: "16px", boxShadow: "0 -2px 8px rgba(0,0,0,0.2)" }}
        >
          <button onClick={() => setActiveStoreId(null)}>Close</button>
          <FlyerViewer storeName={activeStore.name} flyers={activeStore.flyers} />
        </div>
      )}
    </div>
  );
}
