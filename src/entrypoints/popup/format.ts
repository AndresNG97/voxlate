/** Tamaño legible: "850 KB", "61,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es', { maximumFractionDigits: 1 })} MB`;
}
