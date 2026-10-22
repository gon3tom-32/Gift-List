-- Gift-List: a shared couple photo shown beside the list title.
-- The file lives in the private gift-photos bucket at
-- '<household_id>/household/<file>', which the existing storage policies
-- already cover. Members can already update their household row.

alter table households add column if not exists photo_path text;
