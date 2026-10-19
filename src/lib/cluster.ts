// Zoom → pin size (px) and detail level. One source of truth: MapView writes these into CSS vars.
export function zoomLevel(zoom: number) {
  return zoom < 12 ? { px: 28, lvl: 0 } : zoom < 15 ? { px: 40, lvl: 1 } : { px: 56, lvl: 2 }
}

export type Pt = { id: string; x: number; y: number }

// Greedy grouping on screen pixels: a point joins the first group whose seed is closer than minDist.
// shortcut: O(n²), seed-based (not centroid); fine for circles of a few dozen people.
export function cluster(pts: Pt[], minDist: number): string[][] {
  const groups: { seed: Pt; ids: string[] }[] = []
  for (const p of pts) {
    const g = groups.find((g) => Math.hypot(g.seed.x - p.x, g.seed.y - p.y) < minDist)
    if (g) g.ids.push(p.id)
    else groups.push({ seed: p, ids: [p.id] })
  }
  return groups.map((g) => g.ids)
}
