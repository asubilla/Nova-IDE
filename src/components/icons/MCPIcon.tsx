interface MCPIconProps {
  size?: number;
  color?: string;
}

export default function MCPIcon({ size = 16, color = 'currentColor' }: MCPIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6" />
      <path d="M12 16v6" />
      <rect x="6" y="8" width="12" height="8" rx="2" />
      <circle cx="12" cy="12" r="2" fill={color} />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  );
}
