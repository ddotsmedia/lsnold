CREATE TABLE IF NOT EXISTS page_headings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(100) UNIQUE NOT NULL,
  heading_text TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO page_headings (page_slug, heading_text) VALUES
  ('home', 'Welcome to' || E'\n' || 'Little Smarties Nursery'),
  ('age-groups', 'Our Age Groups'),
  ('contact', 'Contact Us'),
  ('gallery', 'Our Gallery'),
  ('events', 'Events & News'),
  ('facilities', 'Our Facilities'),
  ('register', 'Register Your Child'),
  ('booking', 'Tour Booking'),
  ('chatbot', 'Ask Our Assistant')
ON CONFLICT DO NOTHING;
