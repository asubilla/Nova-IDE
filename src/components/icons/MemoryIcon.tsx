interface MemoryIconProps {
  size?: number;
  color?: string;
}

export default function MemoryIcon({ size = 16, color = 'currentColor' }: MemoryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
      <path d="M9 12a3 3 0 1 0 6 0" />
      <path d="M12 8v1" />
      <path d="M15 10l-1 1" />
      <path d="M9 10l1 1" />
    </svg>
  );
}
