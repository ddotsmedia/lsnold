-- The four tour facts on /booking: duration, group size, languages and
-- availability.
--
-- Rows in page_feature_cards rather than a table or columns of their own. The
-- shape is the one migration 062 already stores — an icon, a heading, a
-- paragraph, an order — so a third mechanism for it would only give the same
-- content two places to drift apart in.
--
-- The one thing 062 had no room for is the large value line each card prints
-- between its label and its description ("45 minutes"). That is a column here,
-- nullable, so the safety cards which have no such line are unaffected.
--
-- Seeded from what the page renders today, not from the values in the brief,
-- which differ in all four. Changing published copy is an edit someone should
-- make in admin and see before it goes out, not something a migration does on
-- deploy. For the record, what the brief proposed:
--
--   live now          brief
--   45 minutes        60 minutes
--   2-4 people        Maximum 8 families
--   English & Arabic  English, Arabic
--   By appointment    Monday-Friday, 10am-3pm
--
-- Guarded so a re-run after an edit cannot put the original wording back.
--
-- Additive; 001-062 untouched.

ALTER TABLE page_feature_cards
  ADD COLUMN IF NOT EXISTS value VARCHAR(255);

INSERT INTO page_feature_cards
  (page_slug, section_key, title, value, description, icon, color, sort_order)
SELECT * FROM (VALUES
  ('booking', 'booking-tour-facts', 'Duration', '45 minutes',
   'Long enough to see every room without rushing your morning.', '⏱️', 'red', 0),
  ('booking', 'booking-tour-facts', 'Group Size', '2-4 people',
   'Small groups, so there is time for your own questions.', '👥', 'red', 1),
  ('booking', 'booking-tour-facts', 'Languages', 'English & Arabic',
   'Tell us which you prefer and we will match you with a guide.', '🗣️', 'red', 2),
  ('booking', 'booking-tour-facts', 'Availability', 'By appointment',
   'Weekday slots from 9:00 AM, booked up to 30 days ahead.', '📅', 'red', 3)
) AS s(page_slug, section_key, title, value, description, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM page_feature_cards
   WHERE page_slug = 'booking' AND section_key = 'booking-tour-facts'
);
