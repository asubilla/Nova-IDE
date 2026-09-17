interface CheckIconProps {
  size?: number;
  color?: string;
}

export default function CheckIcon({ size = 16, color = 'currentColor' }: CheckIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
