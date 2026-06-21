import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoreSearch } from "./StoreSearch";

const STORES = [
  { id: 1, name: "コモディイイダ 鹿浜店", address: "東京都足立区鹿浜7-2-3" },
  { id: 2, name: "コモディイイダ 越谷店", address: "埼玉県越谷市" },
];

describe("StoreSearch", () => {
  it("reports all store ids as matches when the query is empty", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);
    expect(onMatchesChange).toHaveBeenCalledWith(new Set([1, 2]));
  });

  it("filters by name substring, case-insensitively", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "鹿浜" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set([1]));
  });

  it("filters by address substring", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "埼玉" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set([2]));
  });

  it("reports an empty set when nothing matches", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "nonexistent" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set());
  });
});
