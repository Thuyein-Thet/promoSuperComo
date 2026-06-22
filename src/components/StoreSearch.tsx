"use client";

import { useEffect, useState } from "react";
import styles from "./StoreSearch.module.css";

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
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === "") {
      onMatchesChange(new Set(stores.map((s) => s.id)));
      setMatchCount(stores.length);
      return;
    }
    const matches = stores.filter(
      (s) => s.name.toLowerCase().includes(normalized) || (s.address ?? "").toLowerCase().includes(normalized),
    );
    onMatchesChange(new Set(matches.map((s) => s.id)));
    setMatchCount(matches.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stores]);

  return (
    <div className={styles.pill}>
      <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        className={styles.input}
        data-testid="store-search-input"
        type="text"
        placeholder="店舗名・地域で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <span className={styles.count}>
        <span className={styles.countDot} aria-hidden="true" />
        {matchCount}店舗
      </span>
    </div>
  );
}
