/** SSAOPass r180 compares *normalized orthographic depths*.
 * Its raw defaults (min .005, max .1) are unusable when flatCAD's
 * engineering camera spans 100000 mm (min alone becomes 500 mm).
 *
 * Convert sensible world-mm occlusion thresholds to normalized depth.
 * This affects only display shading, never exact B-rep geometry.
 */
export function normalizedAoDepthThresholds(
  near:number,far:number,radiusMm:number
):{minDistance:number;maxDistance:number}{
  if(![near,far,radiusMm].every(Number.isFinite)||
    near<0||far<=near||radiusMm<0||radiusMm>24)
    throw Error("Invalid AO camera range/radius");
  const span=far-near;
  const r=Math.max(.1,radiusMm);
  // Exclude tiny depth noise, but keep a normal ~8mm recess visible.
  const minWorld=Math.max(.02,r*.01);
  const maxWorld=Math.max(.5,r*2);
  const minDistance=Math.min(.25,minWorld/span);
  const maxDistance=Math.min(.5,maxWorld/span);
  return {minDistance,maxDistance:Math.max(minDistance*2,maxDistance)};
}
