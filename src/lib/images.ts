const MAX_BYTES = 350_000;
const MAX_EDGE = 1280;

export async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('請選擇圖片檔');
  }
  if (file.size > 8_000_000) {
    throw new Error('圖片太大，請選 8MB 以內的檔案');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法處理圖片');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > MAX_BYTES) {
    throw new Error('壓縮後仍太大，請換一張較小的圖片');
  }
  return dataUrl;
}

export function isSafeImageSrc(src: string | undefined): boolean {
  if (!src) return false;
  return src.startsWith('data:image/') || /^https:\/\//i.test(src);
}
