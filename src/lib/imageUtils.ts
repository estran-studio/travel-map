/**
 * Image URL utility for handling local and Cloudinary images
 */
import type { Photo } from './types/travel-dataset';

export type ImageSize = 'thumbnail' | 'medium' | 'large' | 'original';

/**
 * Generate an image URL based on the current image provider configuration
 * @param imagePath - The image path (local path or Cloudinary public ID)
 * @param size - The desired image size
 * @returns The complete image URL
 */
export function getImageUrl(imagePath: string, size: ImageSize = 'medium'): string {
	if (!imagePath) return '';

	const { images } = __APP_CONFIG__;
	if (images.provider !== 'cloudinary' || !images.cloudinary || isCloudinaryUrl(imagePath)) {
		return imagePath;
	}

	const { baseUrl, transformations } = images.cloudinary;
	const transformation = transformations?.[size] || transformations?.medium || '';
	const publicId = imagePath.replace(/^\/+/, '');

	// The version segment ends the transformation list. Without it Cloudinary parses
	// folder names containing underscores (e.g. `usa_2025`) as transformations and returns 400.
	return transformation
		? `${baseUrl}/${transformation}/v1/${publicId}`
		: `${baseUrl}/v1/${publicId}`;
}

/** URL of a dataset photo at the given size. */
export function getPhotoUrl(photo: Photo, size: ImageSize): string {
	return getImageUrl(photo.cloudinary?.public_id ?? photo.url, size);
}

/** srcset letting the browser pick between the medium and large renditions. */
export function getPhotoSrcSet(photo: Photo): string {
	return `${getPhotoUrl(photo, 'medium')} 960w, ${getPhotoUrl(photo, 'large')} 2048w`;
}

/**
 * Check if an image path is a Cloudinary URL
 * @param imagePath - The image path to check
 * @returns True if it's a Cloudinary URL
 */
export function isCloudinaryUrl(imagePath: string): boolean {
	return imagePath?.startsWith('https://res.cloudinary.com/');
}

/**
 * Convert local image path to Cloudinary public ID
 * @param localPath - Local file path (e.g., "/data/usa_2025/alabama/photo.jpg")
 * @returns Cloudinary public ID (e.g., "usa_2025/alabama/photo")
 */
export function localPathToCloudinaryId(localPath: string): string {
	// Remove leading slash and file extension
	return localPath
		.replace(/^\/+/, '')
		.replace(/^data\//, '')
		.replace(/\.[^/.]+$/, '');
}
