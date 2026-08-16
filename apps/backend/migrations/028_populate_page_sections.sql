-- Fills the sixteen empty page sections with the pages' own words.
--
-- IMPORTANT: these are written as DRAFTS (published_at stays NULL) on purpose.
--
-- PageSections renders at the BOTTOM of every page, after the copy the React
-- component already draws — it was built as an additive block, which is what
-- made it safe to drop into pages whose text still lives in the components.
-- Nothing has been removed from those components. So publishing these rows
-- today would not move the text; it would print it a second time, at the foot
-- of all eight public pages.
--
-- Leaving them as drafts means:
--   * the public site is byte-for-byte unchanged (the public query needs
--     COALESCE(published_at, scheduled_publish_at) <= NOW(), which is NULL here)
--   * an admin opening the editor finds the page's real words to work from
--     rather than an empty box
--   * publishing stays a deliberate act, once the components read these
--     sections in place instead of rendering their own copy
--
-- Re-runnable: only fills sections that are still empty, so an admin's edits
-- are never overwritten.
--
-- Additive; 001-027 untouched.

WITH section_copy(slug, section_key, body) AS (VALUES

('home', 'intro',
 '<p>Little Smarties Nursery was founded in 2007 and has since then been committed to providing the highest international standards of child care. LSN has been identified by ADEK as a nursery with a high level of compliance and academic quality.</p>'),
('home', 'body',
 '<p>We offer tailored programmes for every stage of a child''s development journey, from the first months through to school readiness.</p>'),

('about', 'intro',
 '<p>Little Smarties opened its doors in 2007 with a single room, a handful of families and a straightforward idea: that the early years deserve the same care and thought as any later stage of education.</p><p>Nearly two decades on, we have grown into a full early learning centre serving children from infancy through to school readiness. What has not changed is the scale at which we work — small groups, familiar faces, and teachers who know every child by name and by temperament.</p>'),
('about', 'body',
 '<p>Our teaching team combines formal training in early childhood education with years of practical experience in the classroom. Many have been with us for the better part of a decade, which gives our families the continuity that young children rely on.</p><p>We hold ourselves to a simple standard: every child should leave at the end of the day having been listened to, challenged a little, and kept safe.</p>'),

('facilities', 'intro',
 '<p>Where learning happens in a safe, nurturing environment.</p>'),
('facilities', 'body',
 '<p>Nine dedicated environments, each set up for a different kind of learning. Select any one to see the full detail.</p>'),

('age-groups', 'intro',
 '<p>Tailored programmes for every stage of your child''s development journey.</p>'),
('age-groups', 'body',
 '<p>Each group is built around what children of that age are actually doing — from a warm, nurturing introduction to the world, through moving, talking and exploring with confidence, to growing minds, creative hearts and independent spirits.</p>'),

('gallery', 'intro',
 '<p>A look inside our rooms, our garden and our busiest days.</p>'),
('gallery', 'body',
 '<p>Photographs and video from across the year. Use the categories to narrow the view.</p>'),

('news-events', 'intro',
 '<p>Join us for exciting learning experiences.</p>'),
('news-events', 'body',
 '<p>Upcoming events are listed with the date, time and place, and where a booking is needed you can reserve a place from the event''s own page. News items below carry announcements for families.</p>'),

('contact', 'intro',
 '<p>We are on the ground floor of the Ministry of Justice building in Khalifa City (A), Abu Dhabi. The office is open Monday to Friday, 7:00 to 18:00, and closed at weekends.</p>'),
('contact', 'body',
 '<p>Call us on +971 56 267 7747 or write to info@lsn.ae. If your question is about a place for your child, telling us their age and the term you have in mind helps us answer properly first time.</p>'),

('booking', 'intro',
 '<p>A website can only show you so much. Come and see the rooms while the children are in them, meet the people who would be caring for your child, and ask the questions that matter to your family.</p>'),
('booking', 'body',
 '<p>Tours run during session times so you see the nursery as it actually is. Choose a date and time that suits you and we will confirm by email.</p>')
)

-- Only writes where nothing has been written yet: an admin's own text, and any
-- section already published, are both left alone.
UPDATE page_content_sections s
   SET content = c.body,
       updated_at = NOW()
  FROM section_copy c
  JOIN pages p ON p.slug = c.slug AND p.deleted_at IS NULL
 WHERE s.page_id = p.id
   AND s.section_key = c.section_key
   AND s.deleted_at IS NULL
   AND (s.content IS NULL OR btrim(s.content) = '');
