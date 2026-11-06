import { isClosed, suggestOperation } from "./geometry";
import { newId, validateDocument, type CadDocument, type Feature, type Profile } from "./model";

/** Ctrl/Command-click toggles membership, unmodified click preserves an existing group. */
export function nextSelection(current: readonly string[], id: string | null, additive: boolean): string[] {
  if (id === null) return additive ? [...current] : [];
  if (!additive) return current.includes(id) && current.length > 1 ? [...current] : [id];
  return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
}

export function selectedProfiles(doc: CadDocument, ids: readonly string[]): Profile[] {
  const map = new Map(doc.profiles.map(profile => [profile.id, profile]));
  return [...new Set(ids)].map(id => map.get(id)).filter((p): p is Profile => p !== undefined);
}

/** Conservative group Auto mode; never claim a Boolean intersection without running OCCT. */
export function suggestGroupOperation(doc: CadDocument, ids: readonly string[]): "add" | "cut" {
  const profiles = selectedProfiles(doc, ids);
  if (profiles.length === 0) return "add";
  return doc.features.length > 0 && profiles.every(p => suggestOperation(doc, p) === "cut") ? "cut" : "add";
}

export function documentWithExtrusions(
  doc: CadDocument, ids: readonly string[], operation: "add" | "cut", z: number, depth: number,
): CadDocument {
  const profiles = selectedProfiles(doc, ids);
  if (profiles.length !== new Set(ids).size || profiles.length === 0) throw new Error("Select at least one existing profile");
  if (profiles.some(p => !isClosed(p))) throw new Error("Open paths cannot be extruded");
  const features: Feature[] = profiles.map(profile => ({
    id: newId("feature"), profileId: profile.id, operation, z, depth,
  }));
  return validateDocument({ ...doc, features: [...doc.features, ...features] });
}

/** Update all selected profiles atomically; remain model-based, independent of rendered mesh. */
export function documentWithMovedProfiles(doc: CadDocument, edits: readonly Profile[]): CadDocument {
  const replacements = new Map(edits.map(profile => [profile.id, profile]));
  if (replacements.size !== edits.length || edits.some(p => !doc.profiles.some(q => q.id === p.id))) {
    throw new Error("Invalid group edit");
  }
  return validateDocument({
    ...doc, profiles: doc.profiles.map(profile => replacements.get(profile.id) ?? profile),
  });
}
