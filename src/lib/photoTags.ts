/**
 * Photo tagging helpers.
 *
 * Tags live on the existing `submissions` rows via the `submission_tags`
 * junction table — no new photo table. Filtering is done with a server-side
 * join query (`submission_tags` -> tag ids) rather than in the browser.
 */
import { supabase } from "@/integrations/supabase/client";

export type PhotoTag = {
  id: string;
  name: string;
  color: string;
};

export const REMEDIAL_TAG_NAME = "Remedial Required";

const CHUNK = 200;

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** All tag options available to the current org. */
export async function fetchPhotoTags(): Promise<PhotoTag[]> {
  const { data, error } = await supabase
    .from("photo_tags")
    .select("id, name, color")
    .order("name", { ascending: true });
  if (error) {
    console.error("Failed to load photo tags", error);
    return [];
  }
  return (data || []) as PhotoTag[];
}

/** Map of submission id -> tags, for badge rendering. */
export async function fetchSubmissionTagMap(
  submissionIds: string[],
): Promise<Record<string, PhotoTag[]>> {
  const out: Record<string, PhotoTag[]> = {};
  const ids = submissionIds.filter(Boolean);
  if (ids.length === 0) return out;
  for (const part of chunk(ids)) {
    const { data, error } = await supabase
      .from("submission_tags")
      .select("submission_id, tag:photo_tags(id, name, color)")
      .in("submission_id", part);
    if (error) {
      console.error("Failed to load photo tag links", error);
      continue;
    }
    for (const row of (data || []) as any[]) {
      const tag = row.tag as PhotoTag | null;
      if (!tag) continue;
      (out[row.submission_id] ||= []).push(tag);
    }
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

/**
 * Server-side tag filter — returns the submission ids that carry ANY of the
 * given tags (OR semantics).
 */
export async function fetchSubmissionIdsWithAnyTag(
  tagIds: string[],
  submissionIds: string[],
): Promise<Set<string>> {
  const match = new Set<string>();
  if (tagIds.length === 0 || submissionIds.length === 0) return match;
  for (const part of chunk(submissionIds)) {
    const { data, error } = await supabase
      .from("submission_tags")
      .select("submission_id")
      .in("tag_id", tagIds)
      .in("submission_id", part);
    if (error) {
      console.error("Tag filter query failed", error);
      continue;
    }
    for (const row of (data || []) as any[]) match.add(row.submission_id);
  }
  return match;
}

export async function addSubmissionTag(
  submissionId: string,
  tagId: string,
  userId?: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("submission_tags")
    .upsert(
      { submission_id: submissionId, tag_id: tagId, tagged_by: userId || null },
      { onConflict: "submission_id,tag_id" },
    );
  if (error) {
    console.error("Failed to add tag", error);
    return false;
  }
  return true;
}

export async function removeSubmissionTag(submissionId: string, tagId: string): Promise<boolean> {
  const { error } = await supabase
    .from("submission_tags")
    .delete()
    .eq("submission_id", submissionId)
    .eq("tag_id", tagId);
  if (error) {
    console.error("Failed to remove tag", error);
    return false;
  }
  return true;
}

/**
 * Find (or create) a tag by name for the org, then apply it to a photo.
 * Used by the "create remedial from photo" flow to auto-tag the photo.
 */
export async function applyTagByName(
  submissionId: string,
  name: string,
  orgId?: string | null,
  userId?: string | null,
): Promise<PhotoTag | null> {
  const { data: existing } = await supabase
    .from("photo_tags")
    .select("id, name, color")
    .eq("name", name)
    .maybeSingle();
  let tag = (existing || null) as PhotoTag | null;
  if (!tag) {
    if (!orgId) return null;
    const { data: created, error } = await supabase
      .from("photo_tags")
      .insert({ org_id: orgId, name, color: "#f97316" })
      .select("id, name, color")
      .single();
    if (error || !created) {
      console.error("Failed to create tag", error);
      return null;
    }
    tag = created as PhotoTag;
  }
  const ok = await addSubmissionTag(submissionId, tag.id, userId);
  return ok ? tag : null;
}
