/** The Gift-List mark: a hang tag with a small present, in a mint tile. */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 120 120" focusable="false">
        <path d="M44 12H76L92 28V102Q92 110 84 110H36Q28 110 28 102V28Z" fill="#ffffff" />
        <circle cx="60" cy="27" r="6" fill="#2bb59a" />
        <path d="M60 60C54 48 44 50 47 57c2 4 9 3 13 3zM60 60c6-12 16-10 13-3-2 4-9 3-13 3z" fill="#18806a" />
        <rect x="40" y="60" width="40" height="10" rx="3" fill="#59cdb4" />
        <rect x="43" y="69" width="34" height="30" rx="4" fill="#2bb59a" />
        <rect x="56" y="60" width="8" height="39" fill="#18806a" />
      </svg>
    </span>
  );
}
