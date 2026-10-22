import { useSignedUrl } from '../lib/photos';
import { Icon } from './Icon';

export function GiftPhoto({ path, alt, onAdd }: { path: string | null; alt: string; onAdd?: () => void }) {
  const url = useSignedUrl(path);
  if (url) return <img className="gift-photo" src={url} alt={alt} loading="lazy" decoding="async" />;
  if (path) return <div className="gift-photo placeholder" aria-hidden="true" />;
  return (
    <div className="gift-photo empty">
      <Icon name="camera" size={26} />
      {onAdd ? <span>Add a picture</span> : <span aria-hidden="true">No picture yet</span>}
    </div>
  );
}
