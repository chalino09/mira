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
  bucket: "company-assets";
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

export async function uploadPrivateCompanyFile({
  bucket,
  companyId,
  file,
  supabase,
  type
}: {
  bucket: "pest-photos" | "technical-lab-files";
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

  return path;
}

export async function createPrivateCompanyFileUrl({
  bucket,
  expiresInSeconds = 600,
  path,
  supabase
}: {
  bucket: "pest-photos" | "technical-lab-files";
  expiresInSeconds?: number;
  path: string;
  supabase: SupabaseClient<any>;
}) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function createPrivateCompanyFileUrls({
  bucket,
  expiresInSeconds = 600,
  paths,
  supabase
}: {
  bucket: "pest-photos" | "technical-lab-files";
  expiresInSeconds?: number;
  paths: string[];
  supabase: SupabaseClient<any>;
}) {
  const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
  if (!uniquePaths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniquePaths, expiresInSeconds);
  if (error) throw error;

  const signedUrls = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      signedUrls.set(entry.path, entry.signedUrl);
    }
  }
  return signedUrls;
}
