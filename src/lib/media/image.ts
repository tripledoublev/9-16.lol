const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const MAX_SIZE = 1_900_000; // Leave buffer under 2MB
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function calculate916Crop(
	srcWidth: number,
	srcHeight: number
): CropRegion {
	const targetRatio = 9 / 16;
	const srcRatio = srcWidth / srcHeight;

	let cropWidth: number;
	let cropHeight: number;

	if (srcRatio > targetRatio) {
		// Source is wider, crop sides
		cropHeight = srcHeight;
		cropWidth = srcHeight * targetRatio;
	} else {
		// Source is taller, crop top/bottom
		cropWidth = srcWidth;
		cropHeight = srcWidth / targetRatio;
	}

	return {
		x: (srcWidth - cropWidth) / 2,
		y: (srcHeight - cropHeight) / 2,
		width: cropWidth,
		height: cropHeight
	};
}

export async function loadImage(file: File | Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = URL.createObjectURL(file);
	});
}

export async function cropAndCompress(
	file: File | Blob,
	crop?: CropRegion
): Promise<Blob> {
	const img = await loadImage(file);
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d')!;

	// Calculate crop region if not provided
	const region = crop ?? calculate916Crop(img.width, img.height);

	// Determine output dimensions
	const scale = Math.min(TARGET_WIDTH / region.width, TARGET_HEIGHT / region.height, 1);
	const outWidth = Math.round(region.width * scale);
	const outHeight = Math.round(region.height * scale);

	canvas.width = outWidth;
	canvas.height = outHeight;

	// Draw cropped and scaled image
	ctx.drawImage(
		img,
		region.x,
		region.y,
		region.width,
		region.height,
		0,
		0,
		outWidth,
		outHeight
	);

	// Compress to fit size limit
	for (const quality of QUALITY_STEPS) {
		const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
		if (blob.size <= MAX_SIZE) {
			URL.revokeObjectURL(img.src);
			return blob;
		}
	}

	// If still too large, reduce dimensions
	const reducedCanvas = document.createElement('canvas');
	const reducedCtx = reducedCanvas.getContext('2d')!;
	const reductionScale = Math.sqrt(MAX_SIZE / (await canvasToBlob(canvas, 'image/jpeg', 0.5)).size);

	reducedCanvas.width = Math.round(outWidth * reductionScale);
	reducedCanvas.height = Math.round(outHeight * reductionScale);

	reducedCtx.drawImage(canvas, 0, 0, reducedCanvas.width, reducedCanvas.height);

	const finalBlob = await canvasToBlob(reducedCanvas, 'image/jpeg', 0.7);
	URL.revokeObjectURL(img.src);
	return finalBlob;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error('Failed to create blob'));
			},
			type,
			quality
		);
	});
}

export async function getImageDimensions(
	file: File | Blob
): Promise<{ width: number; height: number }> {
	const img = await loadImage(file);
	const { width, height } = img;
	URL.revokeObjectURL(img.src);
	return { width, height };
}

export function is916Ratio(width: number, height: number, tolerance = 0.02): boolean {
	const ratio = width / height;
	const target = 9 / 16;
	return Math.abs(ratio - target) <= tolerance;
}
