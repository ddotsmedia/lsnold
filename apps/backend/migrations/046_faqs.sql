-- The contact page's frequently asked questions, editable in the admin panel.
--
-- display_order rather than "order": every other ordered table here uses that
-- name (social_links, gallery_images), and "order" is a reserved word that
-- would need quoting in every statement that touched it.
--
-- Seeded from the eight questions currently hardcoded in app/contact/page.tsx.
-- The seed is guarded on the table being empty rather than ON CONFLICT: the
-- primary key is a generated UUID, so a conflict target never matches and a
-- re-run would insert eight more copies.
--
-- Additive; 001-045 untouched.

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50),
  display_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP,
  CONSTRAINT faqs_question_not_blank CHECK (btrim(question) <> ''),
  CONSTRAINT faqs_answer_not_blank CHECK (btrim(answer) <> '')
);

CREATE INDEX IF NOT EXISTS idx_faqs_display_order ON faqs(display_order) WHERE deleted_at IS NULL;

INSERT INTO faqs (question, answer, category, display_order)
SELECT * FROM (VALUES
  ('How do I enroll my child at Little Smarties?',
   'Enrollment is simple! Visit our website, fill out the registration form, or contact us directly. We''ll schedule a tour and answer all your questions about our programs.',
   'enrolment', 1),
  ('What''s your cancellation or withdrawal policy?',
   'We require 30 days notice for withdrawal. Tuition is prorated if you withdraw mid-month. Please contact our office for specific details about your child''s enrollment.',
   'enrolment', 2),
  ('Do you accept part-time enrollment?',
   'Yes! We offer flexible enrollment options including full-time, part-time (3 days/week), and flexible scheduling. Contact us to discuss what works best for your family.',
   'enrolment', 3),
  ('What''s included in tuition?',
   'Tuition includes daily care, meals and snacks, educational activities, field trips, and special programs like music and art. Additional enrichment classes are available for an extra fee.',
   'fees', 4),
  ('How often will I get updates about my child?',
   'We provide daily updates via email and photos. Parents can also access our online portal to see observations and developmental milestones. Parent meetings are held quarterly.',
   'daily life', 5),
  ('What are your safety procedures?',
   'We have comprehensive safety protocols including 24/7 monitoring, strict access control, emergency procedures, and trained staff. Your child''s safety is our top priority.',
   'safety', 6),
  ('Do you provide transportation?',
   'Currently, we do not provide transportation. However, we''re located in a central area with easy access. Many families use ride-sharing services or arrange carpools.',
   'daily life', 7),
  ('What''s your policy on sick children?',
   'We ask parents to keep sick children home if they have fever, diarrhea, or other contagious symptoms. We follow health guidelines to protect all children in our care.',
   'safety', 8)
) AS seed(question, answer, category, display_order)
WHERE NOT EXISTS (SELECT 1 FROM faqs);
