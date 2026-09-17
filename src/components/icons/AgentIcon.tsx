interface AgentIconProps {
  size?: number;
  color?: string;
}

export default function AgentIcon({ size = 16, color = 'currentColor' }: AgentIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 2a4 4 0 0 0-4 4v2h8V6a4 4 0 0 0-4-4z" />
      <circle cx="9" cy="14" r="1" fill={color} />
      <circle cx="15" cy="14" r="1" fill={color} />
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="12" y1="2" x2="12" y2="4" />
    </svg>
  );
}
