# Quick add (name, person, price and picture in one step)

**What:** the "New gift idea" sheet takes everything in one go, so you can add a gift while shopping: name (required), person, optional price, optional picture (camera or photo library), and an optional link under "Link".

**How:** the picture is kept in the form (`photo`, previewed with an object URL). After the gift row is saved, it is resized and uploaded in the background (`uploadPhoto`), then `photo_path` is written with `updateGift`. A picture you add wins over the link's picture. If the upload fails the idea is still saved and a toast says to add the picture from the gift.

**Code:** `src/sheets/QuickAddSheet.tsx`, `src/components/PhotoPicker.tsx`, `src/lib/photos.ts`.

**Rules and pitfalls:** only the name is required; never block saving on the photo or the link lookup. The photo needs the gift id, so it must be uploaded after the insert. Photos stay in the private `gift-photos` bucket.
