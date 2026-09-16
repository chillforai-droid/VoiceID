/**
 * Signed upload to Cloudinary — same flow EditProfilePage uses for the
 * profile avatar (api/cloudinary-sign.ts + direct browser upload),
 * pulled out here so Creator Room avatar/cover uploads don't duplicate
 * it. Returns the permanent secure_url.
 */
export async function uploadImageToCloudinary(file: File, folder: string, publicId: string): Promise<string> {
  const timestamp = Math.round(new Date().getTime() / 1000);

  const signRes = await fetch('/api/cloudinary-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp, folder, public_id: publicId }),
  });
  if (!signRes.ok) {
    const text = await signRes.text().catch(() => '');
    throw new Error(`Failed to get upload signature: ${signRes.status} ${text}`);
  }
  const { signature, apiKey } = await signRes.json();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('signature', signature);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('folder', folder);
  formData.append('public_id', publicId);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) {
    const errorData = await uploadRes.json().catch(() => null);
    throw new Error(errorData?.error?.message || 'Cloudinary upload failed');
  }
  const data = await uploadRes.json();
  if (!data.secure_url) throw new Error('Cloudinary secure_url missing');
  return data.secure_url as string;
}
