export interface PreviewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Center on the trigger; flip vertically and clamp inside the visible region. */
export function hoverPreviewPosition(
  anchor: PreviewBounds,
  bounds: PreviewBounds,
  size: { width: number; height: number; preferredSide?: "top" | "bottom" },
) {
  const margin = 12;
  const gap = 6;
  if (
    anchor.bottom <= bounds.top ||
    anchor.top >= bounds.bottom ||
    anchor.right <= bounds.left ||
    anchor.left >= bounds.right
  )
    return null;
  const width = Math.min(size.width, bounds.right - bounds.left - margin * 2);
  const above = Math.max(0, anchor.top - bounds.top - margin - gap);
  const below = Math.max(0, bounds.bottom - anchor.bottom - margin - gap);
  const preferred = size.preferredSide ?? "bottom";
  const preferredSpace = preferred === "top" ? above : below;
  const otherSpace = preferred === "top" ? below : above;
  const side =
    preferredSpace >= size.height || preferredSpace >= otherSpace
      ? preferred
      : preferred === "top"
        ? "bottom"
        : "top";
  const maxHeight = Math.min(size.height, side === "top" ? above : below);
  if (width <= 0 || maxHeight < Math.min(size.height, 40)) return null;
  const left = Math.max(
    bounds.left + margin,
    Math.min(
      bounds.right - margin - width,
      (anchor.left + anchor.right - width) / 2,
    ),
  );
  return {
    left,
    top: side === "top" ? anchor.top - gap - maxHeight : anchor.bottom + gap,
    width,
    maxHeight,
    side,
  };
}
