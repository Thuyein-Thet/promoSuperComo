"use client";

import { useState } from "react";
import styles from "./FlyerViewer.module.css";

export interface FlyerViewerProps {
  storeName: string;
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

export function FlyerViewer({ storeName, flyers }: FlyerViewerProps) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  return (
    <div className={styles.card}>
      <h3 className={styles.storeName}>{storeName}</h3>
      {flyers.length === 0 ? (
        <p className={styles.empty}>現在掲載中のチラシはありません。</p>
      ) : (
        <div className={styles.grid}>
          {flyers.map((flyer) => (
            <img
              key={flyer.tokubaiImageId}
              data-testid="flyer-thumbnail"
              className={styles.thumbnail}
              src={flyer.blobUrl}
              alt={`Flyer for ${storeName}`}
              onClick={() => setOpenUrl(flyer.blobUrl)}
            />
          ))}
        </div>
      )}
      {openUrl && (
        <div data-testid="flyer-lightbox" className={styles.lightbox} onClick={() => setOpenUrl(null)}>
          <img src={openUrl} alt={`Full-size flyer for ${storeName}`} className={styles.lightboxImage} />
        </div>
      )}
    </div>
  );
}
