-- Whether a comment is on a reel or a photo post (shown as a small tag on the comment bubble).
ALTER TABLE ig_comments ADD COLUMN media_kind VARCHAR(10) NULL AFTER permalink;
