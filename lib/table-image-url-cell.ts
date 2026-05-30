/** 表头是否表示「图片 URL」类列 */
const IMAGE_URL_HEADER_RE =
  /图片\s*url|图片\s*链接|图片\s*地址|image\s*url|image\s*link|img\s*url|thumbnail|thumb\s*url|封面图|主图|商品图/i;

/** 是否为可渲染为 <img> 的 http(s) 图片地址 */
export function looksLikeImageUrl(value: string): boolean {
  const v = (value ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (/\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(v)) return true;
  if (/\.ssl-images-amazon\.com\//i.test(v)) return true;
  if (/images-.*\.amazon\.com\//i.test(v)) return true;
  if (/\/images\/I\//i.test(v)) return true;
  return false;
}

export function isImageUrlColumnHeader(header: string | undefined): boolean {
  const h = (header ?? "").trim();
  if (!h) return false;
  return IMAGE_URL_HEADER_RE.test(h);
}

/** 是否将该单元格渲染为图片（需表头语义 + 值为图片 URL，或值本身为明确图片 URL 且表头含「图」） */
export function shouldRenderTableCellAsImage(columnHeader: string | undefined, value: string): boolean {
  const v = (value ?? "").trim();
  if (!looksLikeImageUrl(v)) return false;
  if (isImageUrlColumnHeader(columnHeader)) return true;
  const h = (columnHeader ?? "").trim();
  if (h && /图|image|photo|pic/i.test(h)) return true;
  return false;
}
