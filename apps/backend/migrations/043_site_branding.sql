-- The site's name, tagline and accent colour, editable from the panel.
--
-- Numbered 043, the next free one — 042 was the last applied. The brief said
-- 051; there is no 043 through 050.
--
-- No logo_url column, deliberately. The logo already lives in site_media under
-- media_key = 'logo', is uploaded through the Media Library, and is read
-- server-side by lib/siteMedia.server.ts so it paints without a flicker. A
-- second logo field here would mean two places holding the same picture and no
-- rule about which one the header believes. The branding page reads the
-- existing one instead.
--
-- What is genuinely new is the name and tagline, which were hardcoded in
-- Header.tsx with no way to change them, and the accent colour.
--
-- One row, enforced by the primary key rather than by convention. The brief's
-- table used a uuid default with ON CONFLICT DO NOTHING, which has no conflict
-- target to fire on — every run of the migration would have inserted another
-- row, and `SELECT ... LIMIT 1` would then return whichever one Postgres
-- happened to reach first.
CREATE TABLE IF NOT EXISTS site_branding (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name      VARCHAR(200) NOT NULL DEFAULT 'Little Smarties',
  tagline        VARCHAR(300),
  -- #rrggbb only. Validated here as well as in the route, because this column
  -- is interpolated into a style attribute and a colour is the one field on
  -- this table that reaches the page as code rather than as text.
  primary_color  VARCHAR(7) NOT NULL DEFAULT '#1e40af'
                 CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seeded with what the site already says, so applying this changes nothing
-- visible. #1e40af is Tailwind's blue-800, the colour the header name is
-- painted today. The brief's #2563eb is blue-600 and would have quietly
-- restyled the header the moment this shipped.
INSERT INTO site_branding (id, site_name, tagline, primary_color)
VALUES (1, 'Little Smarties', NULL, '#1e40af')
ON CONFLICT (id) DO NOTHING;
