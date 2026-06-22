import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlyerViewer } from "./FlyerViewer";

const FLYERS = [
  { tokubaiImageId: "111", blobUrl: "https://blob.example/111.jpg" },
  { tokubaiImageId: "222", blobUrl: "https://blob.example/222.jpg" },
];

describe("FlyerViewer", () => {
  it("renders the store name and a thumbnail per flyer", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    expect(screen.getByText("コモディイイダ 鹿浜店")).toBeInTheDocument();
    expect(screen.getAllByTestId("flyer-thumbnail")).toHaveLength(2);
  });

  it("shows a message instead of thumbnails when there are no flyers", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={[]} />);
    expect(screen.getByText(/チラシはありません/)).toBeInTheDocument();
  });

  it("opens a lightbox with the full-size image when a thumbnail is clicked", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    expect(screen.queryByTestId("flyer-lightbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("flyer-thumbnail")[1]);

    const lightbox = screen.getByTestId("flyer-lightbox");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox.querySelector("img")).toHaveAttribute("src", "https://blob.example/222.jpg");
  });

  it("closes the lightbox when it is clicked again", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    fireEvent.click(screen.getAllByTestId("flyer-thumbnail")[0]);
    fireEvent.click(screen.getByTestId("flyer-lightbox"));
    expect(screen.queryByTestId("flyer-lightbox")).not.toBeInTheDocument();
  });
});
