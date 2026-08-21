CREATE TABLE IF NOT EXISTS site_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name VARCHAR(200) DEFAULT 'Little Smarties',
  tagline VARCHAR(300),
  primary_color VARCHAR(7) DEFAULT '#1e40af' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  font_family VARCHAR(50) DEFAULT 'default' CHECK (font_family IN ('default', 'system', 'georgia', 'times', 'arial', 'verdana', 'trebuchet', 'comic')),
  base_font_size INTEGER DEFAULT 16 CHECK (base_font_size >= 12 AND base_font_size <= 24),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_branding (id, site_name, primary_color, font_family, base_font_size)
VALUES (1, 'Little Smarties', '#1e40af', 'default', 16)
ON CONFLICT DO NOTHING;
