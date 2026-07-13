ALTER TABLE file_trash_entries ADD COLUMN trash_path TEXT;

UPDATE release_metadata SET schema_version = 5, upgraded_at = CURRENT_TIMESTAMP WHERE singleton = 1;
