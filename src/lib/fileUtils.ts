// Shared file utilities used across Jobs, JobDetail, CustomerFolderDrop, etc.

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"];
export const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
];
export const MAX_FILE_SIZE_MB = 100; // 100MB to accommodate video files

export function getFileExtension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExtension(name));
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.includes(getFileExtension(name));
}

export function isAllowedFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ALLOWED_EXTENSIONS.includes(ext) && file.size <= MAX_FILE_SIZE_MB * 1024 * 1024;
}

export function filterAllowedFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(isAllowedFile);
}

export function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}

export function canPreviewInBrowser(fileName: string): boolean {
  return getFileExtension(fileName) === ".pdf";
}

export function getOfficeViewerUrl(signedUrl: string, fileName: string): string | null {
  const ext = getFileExtension(fileName);
  if ([".doc", ".docx", ".xls", ".xlsx"].includes(ext)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
  }
  return null;
}

export const statusColorMap: Record<string, string> = {
  active: "bg-accent/10 text-accent",
  in_progress: "bg-indigo-500/10 text-indigo-600",
  awaiting_parts: "bg-amber-500/10 text-amber-600",
  on_hold: "bg-orange-500/10 text-orange-600",
  requires_revisit: "bg-purple-500/10 text-purple-600",
  scheduled: "bg-cyan-500/10 text-cyan-600",
  completed: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground",
};

export function getStatusColor(status: string): string {
  return statusColorMap[status] || "bg-muted text-muted-foreground";
}
