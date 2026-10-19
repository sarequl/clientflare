import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-fg border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 border border-transparent',
  danger: 'bg-danger text-white hover:bg-danger-hover border border-transparent',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-12 px-5 text-base gap-2 rounded-lg',
}

/** Class string for things that should look like a button (e.g. router Links). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = '') {
  return [
    'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-colors',
    'disabled:opacity-55 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    extra,
  ].join(' ')
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent anim-spin ${className}`}
    />
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  pending?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', pending, icon, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? <Spinner /> : icon}
      {children}
    </button>
  )
}

/** Square icon-only button. Always pass an aria-label. */
export function IconButton({ className = '', variant = 'ghost', ...rest }: ButtonProps & { 'aria-label': string }) {
  return <Button variant={variant} size="sm" className={`!px-0 w-8 ${className}`} {...rest} />
}
