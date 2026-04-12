/**
 * API functions for file uploads
 */

import { getBackendBaseURL } from "../config";

export type UploadAPIMode = "gateway" | "bff";

export interface UploadedFileInfo {
  filename: string;
  size: number;
  path: string;
  virtual_path: string;
  artifact_url: string;
  extension?: string;
  modified?: number;
  markdown_file?: string;
  markdown_path?: string;
  markdown_virtual_path?: string;
  markdown_artifact_url?: string;
}

export interface UploadResponse {
  success: boolean;
  files: UploadedFileInfo[];
  message: string;
}

export interface ListFilesResponse {
  files: UploadedFileInfo[];
  count: number;
}

async function readErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  return error.detail ?? fallback;
}

function uploadsBasePath(threadId: string, apiMode: UploadAPIMode) {
  if (apiMode === "bff") {
    return `/api/bff/conversations/${threadId}/uploads`;
  }
  return `${getBackendBaseURL()}/api/threads/${threadId}/uploads`;
}

/**
 * Upload files to a thread
 */
export async function uploadFiles(
  threadId: string,
  files: File[],
  options: { apiMode?: UploadAPIMode } = {},
): Promise<UploadResponse> {
  const { apiMode = "gateway" } = options;
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(
    uploadsBasePath(threadId, apiMode),
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, "Upload failed"));
  }

  return response.json();
}

/**
 * List all uploaded files for a thread
 */
export async function listUploadedFiles(
  threadId: string,
  options: { apiMode?: UploadAPIMode } = {},
): Promise<ListFilesResponse> {
  const { apiMode = "gateway" } = options;
  const response = await fetch(uploadsBasePath(threadId, apiMode));

  if (!response.ok) {
    throw new Error(
      await readErrorDetail(response, "Failed to list uploaded files"),
    );
  }

  return response.json();
}

/**
 * Delete an uploaded file
 */
export async function deleteUploadedFile(
  threadId: string,
  filename: string,
  options: { apiMode?: UploadAPIMode } = {},
): Promise<{ success: boolean; message: string }> {
  const { apiMode = "gateway" } = options;
  const response = await fetch(
    `${uploadsBasePath(threadId, apiMode)}/${filename}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, "Failed to delete file"));
  }

  return response.json();
}
