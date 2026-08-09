import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
	ButtonHTMLAttributes<HTMLButtonElement> & {
		variant?: "primary" | "secondary" | "quiet";
	}
>;

const variants = {
	primary: "bg-action text-ink shadow-[0_8px_0_#d95734] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_#d95734]",
	secondary: "bg-surface text-ink border border-line hover:bg-[#fff7f2]",
	quiet: "bg-transparent text-ink underline-offset-4 hover:underline",
} as const;

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
	return (
		<button
			className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
