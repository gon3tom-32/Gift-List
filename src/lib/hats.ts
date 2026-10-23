export const HATS = ['santa', 'snowman', 'antlers', 'elf'] as const;
export type Hat = (typeof HATS)[number];

/** A stable hat for a person: the same id always gets the same one. */
export function hatFor(key: string): Hat {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return HATS[Math.abs(h) % HATS.length];
}
