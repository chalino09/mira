"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

function fileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || "jpg";
}

export async function uploadCompanyAsset({
  bucket,
  companyId,
  file,
  supabase,
  type
}: {
  bucket: "company-assets" | "pest-photos";
  companyId: string;
  file: File;
  supabase: SupabaseClient<any>;
  type: string;
}) {
  const path = `${companyId}/${type}-${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
