const COLORS = [
  "#e53e3e", "#dd6b20", "#d69e2e", "#38a169",
  "#319795", "#3182ce", "#5a67d8", "#805ad5",
  "#d53f8c", "#e53e3e",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 36, className = "" }: AvatarProps) {
  const color = COLORS[hashString(name) % COLORS.length];
  const initial = name.startsWith("@") ? name[1] : name[0];

  return (
    <div
      className={`flex items-center justify-center rounded-lg font-semibold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.4,
      }}
    >
      {initial?.toUpperCase() || "?"}
    </div>
  );
}
