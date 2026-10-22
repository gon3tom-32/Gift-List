import { useSignedUrl } from '../lib/photos';

const COLORS = ['#c8102e', '#1f9e86', '#d97706', '#7c3aed', '#2563eb', '#db2777', '#15803d', '#b45309'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A person's photo, or their initials in a colored circle. */
export function Avatar({ name, photoPath, size = 48 }: { name: string; photoPath?: string | null; size?: number }) {
  const url = useSignedUrl(photoPath);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url) {
    return <img className="avatar" src={url} alt="" style={style} />;
  }
  return (
    <span className="avatar" style={{ ...style, background: COLORS[hash(name) % COLORS.length] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
