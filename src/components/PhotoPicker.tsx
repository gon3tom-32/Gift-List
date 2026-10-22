import { useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** "Add a picture" / "Change picture" buttons around a preview. */
export function PhotoPicker({
  preview,
  hasPhoto,
  busy,
  onPick,
  onRemove,
  prompt = 'Add a picture',
}: {
  preview: ReactNode;
  hasPhoto: boolean;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove?: () => void;
  prompt?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="photo-picker">
      <div className="photo-preview">{preview}</div>
      <div className="photo-actions">
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn small" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="camera" size={18} /> {busy ? 'Uploading…' : hasPhoto ? 'Change picture' : prompt}
        </button>
        {hasPhoto && onRemove && (
          <button type="button" className="btn small link" disabled={busy} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
