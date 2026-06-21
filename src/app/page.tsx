"use client";

import dynamic from "next/dynamic";

const FlyerMap = dynamic(() => import("@/components/FlyerMap").then((mod) => mod.FlyerMap), {
  ssr: false,
});

export default function Home() {
  return (
    <main>
      <h1>Comodi Iida Flyers</h1>
      <FlyerMap />
    </main>
  );
}
