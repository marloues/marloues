import { describe, expect, it } from "vitest";
import { hoverPreviewPosition } from "@/components/ui/hover-preview-position";

const bounds = { left: 100, right: 1000, top: 60, bottom: 620 };
const size = { width: 620, height: 300 };
describe("hover preview placement", () => {
  it("prefers above for selection actions and flips below near the top edge", () => {
    const action = { width: 100, height: 34, preferredSide: "top" as const };
    expect(
      hoverPreviewPosition(
        { left: 250, right: 450, top: 200, bottom: 220 },
        bounds,
        action,
      ),
    ).toMatchObject({ left: 300, top: 160, side: "top" });
    expect(
      hoverPreviewPosition(
        { left: 250, right: 450, top: 75, bottom: 95 },
        bounds,
        action,
      ),
    ).toMatchObject({ left: 300, top: 101, side: "bottom" });
  });
  it("centers below the card when the visible region has room", () => {
    expect(
      hoverPreviewPosition(
        { left: 180, right: 920, top: 90, bottom: 140 },
        bounds,
        size,
      ),
    ).toMatchObject({
      left: 240,
      top: 146,
      side: "bottom",
      width: 620,
      maxHeight: 300,
    });
  });
  it("flips above cards near the composer boundary", () => {
    expect(
      hoverPreviewPosition(
        { left: 180, right: 920, top: 540, bottom: 590 },
        bounds,
        size,
      ),
    ).toMatchObject({ left: 240, top: 234, side: "top" });
  });
  it.each([
    [100, 240, 112],
    [860, 1000, 368],
  ])(
    "keeps a centered preview inside either horizontal edge",
    (left, right, expected) => {
      expect(
        hoverPreviewPosition(
          { left, right, top: 90, bottom: 140 },
          bounds,
          size,
        )?.left,
      ).toBe(expected);
    },
  );
  it("constrains the width and height to a smaller conversation", () => {
    const result = hoverPreviewPosition(
      { left: 20, right: 340, top: 200, bottom: 240 },
      { left: 0, right: 360, top: 0, bottom: 400 },
      size,
    )!;
    expect(result).toMatchObject({
      width: 336,
      left: 12,
      side: "top",
      top: 12,
      maxHeight: 182,
    });
  });
  it("hides when the trigger has scrolled behind the composer", () => {
    expect(
      hoverPreviewPosition(
        { left: 180, right: 920, top: 630, bottom: 680 },
        bounds,
        size,
      ),
    ).toBeNull();
  });
});
