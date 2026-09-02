import {
	imageReorderInputSchema,
	imageUploadMetadataSchema,
	productImageSchema,
	type ProductImage,
} from "../../../shared/contracts/catalog";
import { ApiError } from "../../http/errors";
import { MediaRepository, type StoredProductImage } from "./media-repository";

const maxImageBytes = 5 * 1024 * 1024;

type ImageType = {
	extension: "jpg" | "png" | "webp" | "avif";
	mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
};

const imageTypes: ImageType[] = [
	{ extension: "jpg", mimeType: "image/jpeg" },
	{ extension: "png", mimeType: "image/png" },
	{ extension: "webp", mimeType: "image/webp" },
	{ extension: "avif", mimeType: "image/avif" },
];

function matches(bytes: Uint8Array, signature: number[], offset = 0): boolean {
	return bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
}

/** Identifies the accepted image formats from their file signatures, never the client filename. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
	if (matches(bytes, [255, 216, 255])) return imageTypes[0]!;
	if (matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return imageTypes[1]!;
	if (matches(bytes, [82, 73, 70, 70]) && matches(bytes, [87, 69, 66, 80], 8)) return imageTypes[2]!;
	if (
		matches(bytes, [102, 116, 121, 112], 4) &&
		(matches(bytes, [97, 118, 105, 102], 8) || matches(bytes, [97, 118, 105, 115], 8))
	) return imageTypes[3]!;
	return null;
}

function imageFromRow(row: StoredProductImage): ProductImage {
	return productImageSchema.parse({
		id: row.id,
		productId: row.product_id,
		url: `/api/catalog/images/${row.id}`,
		mimeType: row.mime_type,
		byteSize: row.byte_size,
		altText: row.alt_text,
		displayOrder: row.display_order,
		createdAt: row.created_at,
	});
}

function validationError(message: string): ApiError {
	return new ApiError("VALIDATION_ERROR", message);
}

function parseFormData(formData: FormData): { altText: string; image: File } {
	const parsedMetadata = imageUploadMetadataSchema.safeParse({ altText: formData.get("altText") });
	if (!parsedMetadata.success) throw validationError("Image metadata is invalid");
	const imageParts = formData.getAll("image");
	if (imageParts.length !== 1 || !(imageParts[0] instanceof File)) {
		throw validationError("Exactly one image file is required");
	}
	return { altText: parsedMetadata.data.altText, image: imageParts[0] };
}

function isUniqueFailure(error: unknown): boolean {
	return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export class MediaService {
	constructor(
		private readonly repository: MediaRepository,
		private readonly media: R2Bucket,
	) {}

	async upload(productId: string, actorUserId: string, formData: FormData): Promise<ProductImage> {
		if (!await this.repository.productExists(productId)) throw new ApiError("NOT_FOUND", "Product not found");
		if (await this.repository.countImages(productId) >= 5) {
			throw new ApiError("CONFLICT", "Product already has five images");
		}
		const { altText, image } = parseFormData(formData);
		if (image.size === 0 || image.size > maxImageBytes) throw validationError("Image must be between 1 byte and 5 MiB");
		const bytes = new Uint8Array(await image.arrayBuffer());
		const detected = detectImageType(bytes);
		if (!detected || image.type !== detected.mimeType) {
			throw validationError("Image MIME type does not match its file signature");
		}

		const id = crypto.randomUUID();
		const objectKey = `products/${productId}/${crypto.randomUUID()}.${detected.extension}`;
		const displayOrder = await this.repository.countImages(productId);
		await this.media.put(objectKey, image.stream(), { httpMetadata: { contentType: detected.mimeType } });
		try {
			return imageFromRow(await this.repository.insertImage({
				id,
				product_id: productId,
				object_key: objectKey,
				mime_type: detected.mimeType,
				byte_size: image.size,
				alt_text: altText,
				display_order: displayOrder,
				created_by: actorUserId,
			}));
		} catch (error) {
			await this.media.delete(objectKey).catch(() => undefined);
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Product image order changed; retry the upload");
			throw error;
		}
	}

	async reorder(productId: string, payload: unknown): Promise<ProductImage[]> {
		if (!await this.repository.productExists(productId)) throw new ApiError("NOT_FOUND", "Product not found");
		const parsed = imageReorderInputSchema.safeParse(payload);
		if (!parsed.success) throw validationError("Image order is invalid");
		const images = await this.repository.reorderImages(productId, parsed.data.imageIds);
		if (!images) throw new ApiError("CONFLICT", "Image order does not match the product gallery");
		return images.map(imageFromRow);
	}

	async remove(productId: string, imageId: string): Promise<StoredProductImage> {
		if (!await this.repository.productExists(productId)) throw new ApiError("NOT_FOUND", "Product not found");
		const image = await this.repository.removeImage(productId, imageId);
		if (!image) throw new ApiError("NOT_FOUND", "Product image not found");
		return image;
	}

	async getPublicImage(imageId: string): Promise<Response> {
		const image = await this.repository.getPublicImage(imageId);
		if (!image) throw new ApiError("NOT_FOUND", "Image not found");
		const object = await this.media.get(image.object_key);
		if (!object) throw new ApiError("NOT_FOUND", "Image not found");
		return new Response(object.body, {
			headers: {
				"cache-control": "public, max-age=86400",
				"content-type": image.mime_type,
				etag: object.httpEtag,
				"x-content-type-options": "nosniff",
			},
		});
	}
}
