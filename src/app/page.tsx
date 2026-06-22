"use client";

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const FlyerMap = dynamic(() => import("@/components/FlyerMap").then((mod) => mod.FlyerMap), {
  ssr: false,
  loading: () => <div className={styles.loading}>地図を読み込み中…</div>,
});

export default function Home() {
  return (
    <main className={styles.main}>
      <FlyerMap />
    </main>
  );
}
