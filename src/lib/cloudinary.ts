import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadToCloudinary(file: Buffer, fileName: string) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto", // Automatically handles images, raw files, and videos
        public_id: fileName.split('.')[0], // Cloudinary uses this as the name
        folder: "cloud_share_storage",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(file);
  });
}

export async function deleteFromCloudinary(publicId: string) {
  // We need to specify resource_type 'raw' for scripts/binaries
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
  } catch (e) {
    console.error("Cloudinary delete error:", e);
  }
}

export default cloudinary;
