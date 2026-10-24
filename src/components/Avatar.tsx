import { useSignedUrl } from '../lib/photos';

// Deeper tones that keep white initials readable and sit well with the mint and pastel look.
const COLORS = ['#18806a', '#b8426f', '#6f52b8', '#b4562c', '#2f6fa8', '#9b3d6a', '#2a7d4f', '#7a4fa0'];

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
