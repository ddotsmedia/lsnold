-- The footer's company name, logo and contact details, editable in admin.
--
-- Singleton row keyed at id = 1, the same shape as site_branding, so the route
-- can upsert with ON CONFLICT (id) and never has to decide which row is current.
--
-- email, address and hours are TEXT holding one entry per line, because that is
-- what the footer already renders: two mailto links, a three-line address and
-- two lines of opening times. A VARCHAR per line would have fixed the count in
-- the schema; newline-separated text lets an admin add or drop a line without a
-- migration. The component splits on newline and skips blanks.
--
-- logo_url is nullable: the footer shows a 🐣 badge today, and keeps doing so
-- until an image is set here.
--
-- Seeded from the values currently hardcoded in components/Footer.tsx. Shipping
-- this empty would blank the site's contact details the moment the component
-- starts reading from it.
--
-- Additive; 001-044 untouched.

CREATE TABLE IF NOT EXISTS site_footer (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name VARCHAR(200) NOT NULL DEFAULT 'Little Smarties',
  logo_url VARCHAR(2048),
  phone VARCHAR(50),
  email TEXT,
  address TEXT,
  hours TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_footer_singleton CHECK (id = 1),
  CONSTRAINT site_footer_company_name_not_blank CHECK (btrim(company_name) <> '')
);

INSERT INTO site_footer (id, company_name, logo_url, phone, email, address, hours)
VALUES (
  1,
  'Little Smarties',
  NULL,
  '+971 56 267 7747',
  E'lsnmoj@gmail.com\ninfo@lsn.ae',
  E'Ministry Of Justice Ground Floor, Khalifa City (A)\nSector 133, Street 12, P.O. Box 260\nAbu Dhabi United Arab Emirates',
  E'Mon – Fri: 7:00 – 18:00\nWeekends: Closed'
)
ON CONFLICT (id) DO NOTHING;
