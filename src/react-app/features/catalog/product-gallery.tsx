import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import type { ProductDetail } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { ApiClientError } from "../../lib/api-client";
import { useRemoveProductImage, useReorderProductImages, useUploadProductImage } from "./catalog-api";

function messageFor(error: unknown): string {
	if (error instanceof ApiClientError) {
		const issues = error.details?.issues;
		if (Array.isArray(issues)) {
			const issue = issues.find((candidate): candidate is { message: string } =>
				Boolean(candidate) && typeof candidate === "object" && "message" in candidate && typeof candidate.message === "string",
			);
			if (issue) return issue.message;
		}
	}
	return error instanceof Error ? error.message : "We could not update the gallery.";
}

export function ProductGallery({ product }: { product: ProductDetail }) {
	const upload = useUploadProductImage();
	const reorder = useReorderProductImages();
	const remove = useRemoveProductImage();
	const [file, setFile] = useState<File | null>(null);
	const [altText, setAltText] = useState("");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const images = useMemo(() => [...product.images].sort((left, right) => left.displayOrder - right.displayOrder), [product.images]);
	const busy = upload.isPending || reorder.isPending || remove.isPending;
	const galleryFull = images.length >= 5;

	useEffect(() => () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	}, [previewUrl]);

	const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
		const selected = event.target.files?.[0] ?? null;
		setFile(selected);
		setMessage(null);
		setPreviewUrl((current) => {
			if (current) URL.revokeObjectURL(current);
			return selected && typeof URL.createObjectURL === "function" ? URL.createObjectURL(selected) : null;
		});
	};

	const uploadImage = async () => {
		if (!file || !altText.trim() || galleryFull) return;
		setMessage(null);
		try {
			await upload.mutateAsync({ productId: product.id, file, altText });
			setFile(null);
			setAltText("");
			setPreviewUrl(null);
		} catch (error) {
			setMessage(messageFor(error));
		}
	};

	const move = async (index: number, distance: -1 | 1) => {
		const target = index + distance;
		if (target < 0 || target >= images.length) return;
		const next = [...images];
		const [image] = next.splice(index, 1);
		next.splice(target, 0, image!);
		setMessage(null);
		try {
			await reorder.mutateAsync({ productId: product.id, imageIds: next.map((candidate) => candidate.id) });
		} catch (error) {
			setMessage(messageFor(error));
		}
	};

	const removeImage = async (imageId: string) => {
		setMessage(null);
		try {
			await remove.mutateAsync({ productId: product.id, imageId });
		} catch (error) {
			setMessage(messageFor(error));
		}
	};

	return <div className="space-y-5">
		{message ? <p aria-live="assertive" className="rounded-xl border border-[#b8d4df] bg-[#f2f8fb] px-4 py-3 text-sm font-medium text-[#4f8194]">{message}</p> : null}
		<div className="grid gap-4 rounded-2xl border border-line bg-[#f7fbfd] p-4 md:grid-cols-[minmax(0,1fr)_auto]">
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="grid gap-1.5 text-sm font-medium" htmlFor="product-image-file">Image file<input accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy || galleryFull} id="product-image-file" onChange={selectFile} type="file" /></label>
				<label className="grid gap-1.5 text-sm font-medium" htmlFor="product-image-alt">Alt text<input className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal outline-none focus:border-action" disabled={busy || galleryFull} id="product-image-alt" onChange={(event) => setAltText(event.target.value)} placeholder="Describe this image" value={altText} /></label>
			</div>
			<Button disabled={!file || !altText.trim() || busy || galleryFull} onClick={() => void uploadImage()} type="button">{upload.isPending ? "Uploading…" : "Upload image"}</Button>
		</div>
		{previewUrl ? <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3"><img alt="Selected image preview" className="size-16 rounded-lg object-cover" src={previewUrl} /><p className="text-sm text-muted">Preview only — upload to save this image.</p></div> : null}
		{galleryFull ? <p className="text-sm font-medium text-muted">Maximum of five images reached. Remove an image before uploading another.</p> : null}
		{images.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No product images yet.</p> : <ol className="grid gap-3 sm:grid-cols-2">{images.map((image, index) => <li className="flex gap-3 rounded-2xl border border-line bg-surface p-3" key={image.id}>
			<img alt={image.altText} className="size-20 rounded-xl border border-line object-cover" src={image.url} />
			<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{image.altText}</p>{image.displayOrder === 0 ? <span className="rounded-full bg-[#e7f5df] px-2 py-0.5 text-xs font-medium text-[#28633e]">Primary</span> : null}</div><p className="mt-1 text-xs text-muted">Image {index + 1} of {images.length}</p><div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-9 px-3 text-xs" disabled={busy || index === 0} onClick={() => void move(index, -1)} type="button" variant="secondary">Move left</Button><Button className="min-h-9 px-3 text-xs" disabled={busy || index === images.length - 1} onClick={() => void move(index, 1)} type="button" variant="secondary">Move right</Button><Button className="min-h-9 px-3 text-xs" disabled={busy} onClick={() => void removeImage(image.id)} type="button" variant="quiet">Remove</Button></div></div>
		</li>)}</ol>}
	</div>;
}
