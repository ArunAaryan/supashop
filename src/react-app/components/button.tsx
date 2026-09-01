import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
	ButtonHTMLAttributes<HTMLButtonElement> & {
		variant?: "primary" | "secondary" | "quiet";
	}
>;

const variants = {
	primary: "bg-action text-ink shadow-[0_8px_0_#a5d2e2] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_#a5d2e2]",
	secondary: "bg-surface text-ink border border-line hover:bg-[#f7fbfd]",
	quiet: "bg-transparent text-ink underline-offset-4 hover:underline",
} as const;

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
	return (
		<button
			className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
