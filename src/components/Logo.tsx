import Image from 'next/image'

type LogoProps = {
  variant?: 'full' | 'mark'
  className?: string
  priority?: boolean
}

export function Logo({ variant = 'full', className, priority }: LogoProps) {
  if (variant === 'mark') {
    return (
      <Image
        src="/brand/logo-mark.svg"
        alt="BASS"
        width={93}
        height={99}
        priority={priority}
        className={className}
      />
    )
  }
  return (
    <Image
      src="/brand/logo.svg"
      alt="Bantu Afro Sound Society"
      width={246}
      height={200}
      priority={priority}
      className={className}
    />
  )
}
