/** Move the *display-only* 3D reference grid below the lowest displayed solid.
 *
 * The model and all sketch coordinates stay in fixed XY / physical mm. This
 * positioning only prevents the visual reference grid from slicing through
 * solids with negative Z, or cutting tools with overshoot.
 */
export function presentationGridZ(
  mainMinZ:number, mainHeight:number, toolMinZ?:number
):number {
  if(!Number.isFinite(mainMinZ)||!Number.isFinite(mainHeight)||mainHeight<0)
    throw new Error("Invalid solid display bounds");
  if(toolMinZ!==undefined&&!Number.isFinite(toolMinZ))
    throw new Error("Invalid cutting-tool bounds");
  const min=Math.min(mainMinZ,toolMinZ??mainMinZ);
  const clearance=Math.max(.5,Math.min(5,mainHeight*.02));
  return min-clearance;
}
