import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	error?: string;
	wrapperClassName?: string;
};

export function Field({ error, id, label, className = "", wrapperClassName = "", ...props }: FieldProps) {
	const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
	const errorId = `${fieldId}-error`;
	return (
		<label className={`grid gap-1.5 text-sm font-medium text-ink ${wrapperClassName}`} htmlFor={fieldId}>
			{label}
			<input
				aria-describedby={error ? errorId : undefined}
				aria-invalid={Boolean(error)}
				className={`min-h-12 w-full min-w-0 rounded-2xl border bg-surface px-4 text-base font-normal outline-none transition placeholder:text-muted/75 focus:border-action ${error ? "border-action" : "border-line"} ${className}`}
				id={fieldId}
				{...props}
			/>
			{error ? <span className="font-normal text-[#ae3f27]" id={errorId}>{error}</span> : null}
		</label>
	);
}
