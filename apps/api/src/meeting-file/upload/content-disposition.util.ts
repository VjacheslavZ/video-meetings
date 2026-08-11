function asciiFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
}

export function buildContentDisposition(filename: string): string {
  const fallback = asciiFallback(filename);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
