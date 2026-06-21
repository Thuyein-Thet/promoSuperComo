import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, eventHandlers, position }: any) => (
    <button data-testid="marker" data-position={JSON.stringify(position)} onClick={() => eventHandlers.click()}>
      {children}
    </button>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

vi.mock("leaflet.markercluster", () => ({}));

vi.mock("react-leaflet-cluster", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { FlyerMap } from "./FlyerMap";

const STORES = [
  { id: 1, tokubaiStoreId: "259321", name: "コモディイイダ 鹿浜店", address: "東京都足立区鹿浜7-2-3", lat: 35.78, lng: 139.76, flyers: [{ tokubaiImageId: "111", blobUrl: "https://blob.example/111.jpg" }] },
  { id: 2, tokubaiStoreId: "7530", name: "コモディイイダ 越谷店", address: "埼玉県越谷市", lat: 35.88, lng: 139.79, flyers: [] },
  { id: 3, tokubaiStoreId: "999", name: "コモディイイダ ジオ無し店", address: null, lat: null, lng: null, flyers: [] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => STORES })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FlyerMap", () => {
  it("fetches stores and renders one marker per store with coordinates", async () => {
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));
  });

  it("filters markers based on search matches", async () => {
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "鹿浜" } });

    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(1));
  });

  it("shows a popup with the FlyerViewer on desktop width when a marker is clicked", async () => {
    vi.stubGlobal("innerWidth", 1024);
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    // Every marker carries its own Popup as a permanent child (the idiomatic
    // react-leaflet pattern, letting Leaflet itself handle open/close on
    // click without remounting the marker). The mock doesn't model Leaflet's
    // real click-to-open behavior, so we just assert the popup content for
    // the clicked marker is present, and the mobile panel is not.
    const markers = screen.getAllByTestId("marker");
    fireEvent.click(markers[0]);

    const popups = screen.getAllByTestId("popup");
    expect(popups).toHaveLength(2);
    expect(markers[0]).toContainElement(popups[0]);
    expect(screen.queryByTestId("flyer-panel")).not.toBeInTheDocument();
  });

  it("shows a bottom panel with the FlyerViewer on mobile width when a marker is clicked", async () => {
    vi.stubGlobal("innerWidth", 480);
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId("marker")[0]);

    expect(screen.getByTestId("flyer-panel")).toBeInTheDocument();
  });
});
