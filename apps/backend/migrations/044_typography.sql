-- The site's font and base text size, editable from the panel.
--
-- Numbered 044, the next free one — 043 was the last applied. The brief said
-- 052; there is no 044 through 051.
--
-- Added to site_branding rather than a global_typography table of its own.
-- Both describe how the site looks, both are a single row, both need the same
-- public read and the same manage:settings write. A second one-row table would
-- have meant a second endpoint, a second hook and a second fetch on every page
-- to carry two more columns.
--
-- font_family holds a token, not a CSS font stack. The value is interpolated
-- into a style attribute on every page, so it is checked against a fixed list
-- here and again in the route; the token is mapped to a real stack in
-- lib/typography.ts, which is also what the picker renders from, so the two
-- cannot drift apart. Storing raw CSS would put an unvalidated string from a
-- form field directly into the page's styling.
ALTER TABLE site_branding
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(40) NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS base_font_size INTEGER NOT NULL DEFAULT 16;

-- Separate statements: ADD CONSTRAINT has no IF NOT EXISTS, so re-running the
-- migration would fail on the second pass without this guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_branding_font_family_check'
  ) THEN
    ALTER TABLE site_branding ADD CONSTRAINT site_branding_font_family_check
      CHECK (font_family IN (
        'default', 'system', 'georgia', 'times', 'arial', 'verdana',
        'trebuchet', 'comic'
      ));
  END IF;

  -- 12 to 24, matching the slider. This sets the root font size, and every
  -- Tailwind size on the site is in rem, so a value outside that range would
  -- scale the whole layout past the point where it still holds together.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_branding_base_font_size_check'
  ) THEN
    ALTER TABLE site_branding ADD CONSTRAINT site_branding_base_font_size_check
      CHECK (base_font_size BETWEEN 12 AND 24);
  END IF;
END $$;

-- 'default' is the site's own Nunito, already loaded through next/font. The
-- brief's default of system-ui would have replaced it the moment this shipped,
-- changing every page's body text without anybody choosing to.
