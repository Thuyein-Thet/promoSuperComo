"use client";

import { useEffect, useState } from "react";

export interface SearchableStore {
  id: number;
  name: string;
  address: string | null;
}

export interface StoreSearchProps {
  stores: SearchableStore[];
  onMatchesChange: (matchedIds: Set<number>) => void;
}

export function StoreSearch({ stores, onMatchesChange }: StoreSearchProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === "") {
      onMatchesChange(new Set(stores.map((s) => s.id)));
      return;
    }
    const matches = stores.filter(
      (s) => s.name.toLowerCase().includes(normalized) || (s.address ?? "").toLowerCase().includes(normalized),
    );
    onMatchesChange(new Set(matches.map((s) => s.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stores]);

  return (
    <input
      data-testid="store-search-input"
      type="text"
      placeholder="Search store name or area..."
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
