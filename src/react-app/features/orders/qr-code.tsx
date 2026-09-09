import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, alt }: { value: string; alt: string }) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		QRCode.toDataURL(value, { margin: 1, width: 240, color: { dark: "#1a1a1a", light: "#ffffff" } })
			.then((url) => {
				if (!cancelled) setDataUrl(url);
			})
			.catch(() => {
				if (!cancelled) setDataUrl(null);
			});
		return () => {
			cancelled = true;
		};
	}, [value]);

	if (!dataUrl) return <span aria-busy="true" className="text-sm text-muted">Generating code…</span>;
	return <img alt={alt} className="size-44 rounded-xl border border-line" src={dataUrl} />;
}
