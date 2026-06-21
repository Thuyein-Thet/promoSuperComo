"use client";

import { useState } from "react";

export interface FlyerViewerProps {
  storeName: string;
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

export function FlyerViewer({ storeName, flyers }: FlyerViewerProps) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  return (
    <div>
      <h3>{storeName}</h3>
      {flyers.length === 0 ? (
        <p>No current flyers for this store.</p>
      ) : (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {flyers.map((flyer) => (
            <img
              key={flyer.tokubaiImageId}
              data-testid="flyer-thumbnail"
              src={flyer.blobUrl}
              alt={`Flyer for ${storeName}`}
              style={{ width: "80px", height: "auto", cursor: "pointer" }}
              onClick={() => setOpenUrl(flyer.blobUrl)}
            />
          ))}
        </div>
      )}
      {openUrl && (
        <div
          data-testid="flyer-lightbox"
          onClick={() => setOpenUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <img src={openUrl} alt={`Full-size flyer for ${storeName}`} style={{ maxWidth: "90vw", maxHeight: "90vh" }} />
        </div>
      )}
    </div>
  );
}
