/* =====================================================
   URVI – cloudinary.js  |  Shared Cloudinary Upload & Cleanup Utility
   ===================================================== */

export const CLOUD_NAME = "fxmm5ecw";
export const UPLOAD_PRESET = "urvi_posts";

/**
 * Upload an image or video file (or Blob) to Cloudinary and return secure URL.
 * Also attaches public_id, resource_type, and metadata properties to returned String.
 * @param {File|Blob} file – The image/video file or blob to upload.
 * @param {function} [onProgress] – Optional callback receiving progress 0-100.
 * @returns {Promise<string>} – The secure_url from Cloudinary with attached properties.
 */
export async function uploadToCloudinary(file, onProgress) {
    const data = await uploadToCloudinaryDetailed(file, onProgress);
    const urlStr = new String(data.secure_url);
    urlStr.public_id = data.public_id;
    urlStr.resource_type = data.resource_type;
    urlStr.metadata = data;
    return data.secure_url;
}

/**
 * Upload to Cloudinary and return full JSON response metadata.
 * @param {File|Blob} file 
 * @param {function} [onProgress] 
 * @returns {Promise<{secure_url: string, public_id: string, resource_type: string, format: string}>}
 */
export async function uploadToCloudinaryDetailed(file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);

        const resourceType = file.type && file.type.startsWith("video/") ? "video" : "auto";

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    resolve({
                        secure_url: data.secure_url,
                        public_id: data.public_id,
                        resource_type: data.resource_type || (isVideoUrl(data.secure_url) ? "video" : "image"),
                        format: data.format
                    });
                } catch (err) {
                    reject(new Error("Invalid response from Cloudinary."));
                }
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    reject(new Error(err.error?.message || "Cloudinary upload failed."));
                } catch {
                    reject(new Error("Cloudinary upload failed."));
                }
            }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
        xhr.send(formData);
    });
}

/**
 * Extract public_id and resource_type from a Cloudinary URL safely.
 * @param {string} url 
 * @returns {{public_id: string|null, resource_type: string}}
 */
export function extractPublicIdFromUrl(url) {
    if (!url || typeof url !== "string" || !url.includes("cloudinary.com")) {
        return { public_id: null, resource_type: "image" };
    }

    try {
        const isVid = isVideoUrl(url);
        const resource_type = isVid ? "video" : "image";

        // Typical format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/public_id.ext
        const uploadIdx = url.indexOf("/upload/");
        if (uploadIdx === -1) return { public_id: null, resource_type };

        let pathAfterUpload = url.substring(uploadIdx + 8); // Skip "/upload/"
        // Strip version prefix if present e.g. "v1712345678/"
        if (/^v\d+\//.test(pathAfterUpload)) {
            pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");
        }

        // Remove extension (e.g. .png, .jpg, .mp4)
        const dotIdx = pathAfterUpload.lastIndexOf(".");
        const public_id = dotIdx !== -1 ? pathAfterUpload.substring(0, dotIdx) : pathAfterUpload;

        return { public_id, resource_type };
    } catch (e) {
        console.warn("Could not extract Cloudinary public_id from URL:", url, e);
        return { public_id: null, resource_type: isVideoUrl(url) ? "video" : "image" };
    }
}

/**
 * Request secure deletion of a Cloudinary asset via Vercel serverless endpoint.
 * @param {string} publicId 
 * @param {string} [resourceType="image"] 
 * @returns {Promise<boolean>}
 */
export async function deleteFromCloudinary(publicId, resourceType = "image") {
    if (!publicId) return false;
    try {
        const res = await fetch("/api/destroy-cloudinary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: publicId, resource_type: resourceType })
        });
        if (res.ok) {
            const data = await res.json();
            return data.success === true;
        } else {
            console.warn("Cloudinary delete serverless returned status:", res.status);
            return false;
        }
    } catch (e) {
        console.warn("Cloudinary asset deletion error:", e);
        return false;
    }
}

/**
 * Check if a URL or MIME type represents a video.
 * @param {string} url 
 * @returns {boolean}
 */
export function isVideoUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.endsWith(".mp4") ||
        lower.endsWith(".webm") ||
        lower.endsWith(".mov") ||
        lower.endsWith(".m4v") ||
        lower.includes("/video/upload/") ||
        lower.includes("resource_type=video")
    );
}

/**
 * Crop an image file to a 1:1 square, resize to targetSize, and return as Blob.
 * @param {File} file – The original image file.
 * @param {number} [targetSize=300] – Output dimension in pixels.
 * @returns {Promise<Blob>} – The cropped JPEG blob.
 */
export function cropToSquare(file, targetSize = 300) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext("2d");
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, targetSize, targetSize);
                canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
                    "image/jpeg",
                    0.85
                );
            };
            img.onerror = () => reject(new Error("Failed to load image."));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
    });
}
