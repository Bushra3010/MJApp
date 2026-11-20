// Resize + re-encode a photo on the device before upload. Re-encoding through a canvas drops EXIF data (incl. GPS).
export async function preparePhoto(file, size = 600) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo');
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is too large');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error("This photo format isn't supported. Try a JPG or PNG."); }
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close?.();
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  return blob;
}
