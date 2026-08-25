'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageVideo } from '@/components/PageVideo';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { Button } from '@/components/Button';
import { Carousel } from '@/components/Carousel';
import { MissionCard, type MissionCardColor, type MissionCardTitle } from '@/components/MissionCard';
import { StaffCards } from '@/components/StaffCards';
import { HandprintDivider } from '@/components/Handprints';
import { useStaff, type StaffMember } from '@/lib/staff';
import { Butterfly, Circle, Cloud, Flower } from '@/components/Decorations';
import { HeroBackground } from '@/components/HeroBackground';
import { usePageMedia } from '@/lib/media';
import { useTestimonials, type ApiTestimonial } from '@/lib/testimonials';
import { cloudinaryResize, buildSrcSet, CARD_WIDTHS } from '@/lib/cloudinary';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

interface MissionEntry {
  /** Section key; see MISSION_VISION_VALUES below. */
  key: string;
  icon: string;
  title: MissionCardTitle;
  content: string;
  color: MissionCardColor;
}

/**
 * `key` is the section this block is edited under in admin -> Pages -> About
 * -> Text. One key per block, not a `-title`/`-text` pair: the public endpoint
 * only returns a section that has content, so a section carrying a heading and
 * no body would never be delivered and the heading would silently never apply.
 * The section's Title overrides the block's heading, its Content the body.
 *
 * The copy here stays as the fallback, so a block with nothing written for it
 * reads exactly as it always has.
 */
const MISSION_VISION_VALUES: readonly MissionEntry[] = [
  {
    key: 'nursery-mission',
    icon: '🎯',
    title: 'Mission',
    content:
      'To provide high-quality early childhood education that nurtures the whole child - academically, socially, emotionally, and physically. We create a safe, loving environment where every child can thrive and reach their full potential.',
    color: 'red',
  },
  {
    key: 'nursery-vision',
    icon: '🌟',
    title: 'Vision',
    content:
      'Every child confident, creative, curious, and kind. We envision a world where early childhood education empowers children to become lifelong learners and engaged global citizens.',
    color: 'blue',
  },
  {
    key: 'nursery-values',
    icon: '💎',
    title: 'Values',
    content:
      'Nurturing: We care deeply for each child. Safe: We provide a secure environment. Inclusive: We celebrate diversity. Excellence: We pursue the highest standards. Growth: We support continuous development.',
    color: 'green',
  },
];

interface PhilosophyEntry {
  /** Section key; see MISSION_VISION_VALUES above. */
  key: string;
  title: string;
  paragraphs: readonly string[];
  /** Tailwind gradient classes for the accompanying placeholder image. */
  gradient: string;
}

const PHILOSOPHY: readonly PhilosophyEntry[] = [
  {
    key: 'nursery-learning-through-play',
    title: 'Learning Through Play',
    paragraphs: [
      'Young children make sense of the world by handling it, testing it and talking about it. Our rooms are set up so that play is the work of the day: open-ended materials, space to build, and adults who join in rather than direct.',
      'Every activity has a developmental purpose behind it, even when it looks like nothing more than water, sand or blocks. Our teachers plan around what each group is curious about that week, then step back and let the exploring happen.',
    ],
    gradient: 'from-blue-100 to-blue-200',
  },
  {
    key: 'nursery-every-child',
    title: 'Every Child on Their Own Path',
    paragraphs: [
      'Children reach the same milestones at different times, and that is entirely normal. We observe and record where each child is rather than measuring them against a fixed timetable, and we plan the next small step from there.',
      'Small group sizes mean a teacher can notice when a child is ready to be stretched, or when they need more time to consolidate. Progress is shared with families regularly so there are no surprises.',
    ],
    gradient: 'from-red-100 to-orange-100',
  },
  {
    // Not in the brief's key list, which stopped at two — but leaving the third
    // block alone would make two of three editable for no reason.
    key: 'nursery-family-partnership',
    title: 'A Partnership With Families',
    paragraphs: [
      'What happens at home and what happens at nursery need to point in the same direction. We keep communication frequent and practical, so families know what their child did today and what they are working towards.',
      'Parents are welcome to visit, ask questions and tell us what they are seeing at home. The children benefit most when the adults around them are working from the same picture.',
    ],
    gradient: 'from-green-100 to-emerald-200',
  },
];

/**
 * Which page media slot illustrates each philosophy block, by position.
 *
 * Not feature_1, feature_2, feature_3. feature_1 is the intro section's tile
 * further up this page, so mapping it here would publish the same photograph
 * twice on /nursery.
 *
 * background is otherwise unused on this page, which makes it the free slot
 * for the third block. Nothing is uploaded to it yet, so that block keeps its
 * tint until someone adds one in Media Library -> Pages -> About -> Background.
 */
const PHILOSOPHY_SLOTS: readonly (string | undefined)[] = ['feature_2', 'feature_3', 'background'];

interface TeamMember {
  name: string;
  position: string;
  bio: string;
}

/** What the page showed before the team moved into the database. */
const FALLBACK_TEAM_RAW: readonly TeamMember[] = [
  {
    name: 'Sarah Ahmed',
    position: 'Director',
    bio: '20+ years in early childhood education and program development. Former education advisor. Passionate about creating inclusive learning environments.',
  },
  {
    name: 'Fatima Khan',
    position: 'Head Teacher - Infants',
    bio: '15+ years working with infants and toddlers. Specialized training in developmental psychology. Dedicated to responsive caregiving.',
  },
  {
    name: 'Aisha Mohammed',
    position: 'Head Teacher - Toddlers',
    bio: '12+ years in toddler care and early learning. Certified in Montessori and Reggio Emilia approaches.',
  },
  {
    name: 'Layla Hassan',
    position: 'Head Teacher - Preschool',
    bio: '10+ years in preschool education. Specialist in curriculum development and art therapy.',
  },
  {
    name: 'Maryam Ibrahim',
    position: 'Support Staff & Activities Coordinator',
    bio: "8+ years supporting children's activities and special programs. Background in music and dance therapy.",
  },
  {
    name: 'Zainab Ali',
    position: 'Nutritionist & Wellness Coordinator',
    bio: 'Registered dietitian with 6+ years in pediatric nutrition. Ensures all meals meet health and safety standards.',
  },
];

// Shaped like a row so the hook can hand back either without the page caring.
const FALLBACK_TEAM: readonly StaffMember[] = FALLBACK_TEAM_RAW.map((m, i) => ({
  id: `fallback-${i + 1}`,
  name: m.name,
  role: m.position,
  bio: m.bio,
  photo_url: null,
  display_order: i + 1,
}));

/**
 * Every section key this page renders itself. Anything not listed here is
 * published a second time by the PageSections block at the foot of the page.
 *
 * The two mapped lists are spread rather than spelled out so that adding an
 * entry to either cannot quietly reintroduce a duplicate.
 */
const CONSUMED_SECTION_KEYS: readonly string[] = [
  'nursery-hero',
  'nursery-what-we-stand-for',
  ...MISSION_VISION_VALUES.map((entry) => entry.key),
  'nursery-philosophy',
  ...PHILOSOPHY.map((entry) => entry.key),
  'nursery-team',
  'nursery-testimonials',
  'nursery-cta',
];

interface Testimonial {
  quote: string;
  author: string;
  location: string;
  rating: number;
}

/**
 * Real reviews as published on the live site, kept as the fallback for when
 * the API is unreachable or nothing is published for this page. Migration 025
 * seeded the database from this list, so the two agree.
 */
const FALLBACK_TESTIMONIALS: readonly ApiTestimonial[] = [
  {
    quote:
      'My daughter has flourished at Little Smarties. The teachers are so caring and professional. I see her learning and growing every single day.',
    id: 'Fatima Al-Mansouri',
    author_name: 'Fatima Al-Mansouri',
    author_title: 'Abu Dhabi',
    author_image_url: null,
    rating: 5,
  },
  {
    quote:
      'Best decision we made for our son’s early education. The facilities are amazing and the teachers truly know each child individually.',
    id: 'Mohammad Al-Mazrouei',
    author_name: 'Mohammad Al-Mazrouei',
    author_title: 'Abu Dhabi',
    author_image_url: null,
    rating: 5,
  },
  {
    quote:
      'Little Smarties is a home away from home. My twins are happy, engaged, and learning so much. Highly recommended!',
    id: 'Hana Al-Ketbi',
    author_name: 'Hana Al-Ketbi',
    author_title: 'Abu Dhabi',
    author_image_url: null,
    rating: 5,
  },
  {
    quote:
      'Professional, caring, and educational. Everything we look for in a nursery. Our child looks forward to going every day!',
    id: 'Ahmed Al-Suwaidi',
    author_name: 'Ahmed Al-Suwaidi',
    author_title: 'Abu Dhabi',
    author_image_url: null,
    rating: 5,
  },
];

/* -------------------------------------------------------------------------- */
/* Local presentational pieces                                                 */
/* -------------------------------------------------------------------------- */

interface StarRatingProps {
  rating: number;
  max?: number;
}

/** Renders `rating` filled stars out of `max`, announced as a single label. */
function StarRating({ rating, max = 5 }: StarRatingProps) {
  const filled = Math.max(0, Math.min(Math.round(rating), max));

  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, index) => (
        <svg
          key={index}
          width={18}
          height={18}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={index < filled ? 'text-yellow-400' : 'text-gray-300'}
          fill="currentColor"
        >
          <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.35l-5.81 3.05 1.11-6.47L2.6 9.35l6.5-.95L12 2.5z" />
        </svg>
      ))}
    </div>
  );
}

function TestimonialCard({ testimonial }: { testimonial: ApiTestimonial }) {
  return (
    <figure className="flex h-full flex-col rounded-lg bg-white p-6 shadow-md transition-shadow duration-200 ease-in-out hover:shadow-lg md:p-8">
      {/* Only when a rating was given: a review without one should not be
          shown as five stars. */}
      {testimonial.rating ? <StarRating rating={testimonial.rating} /> : null}
      <blockquote className="mt-4 grow text-base leading-relaxed text-gray-700">
        &ldquo;{testimonial.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
        {testimonial.author_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryResize(testimonial.author_image_url, 112, 112)}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        )}
        <span>
          <span className="block font-semibold text-gray-800">{testimonial.author_name}</span>
          {testimonial.author_title && (
            <span className="block text-sm text-gray-600">{testimonial.author_title}</span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function NurseryPage() {
  // Hero image uploaded via admin → Media Library → Pages. Absent until one is
  // set, in which case the hero keeps its gradient.
  const pageImages = usePageMedia('nursery');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('about'));
  // Managed in admin -> Staff. Falls back to the built-in team when nothing is
  // published or the request fails.
  const team = useStaff(FALLBACK_TEAM);

  // Managed in admin -> Testimonials. Falls back to the built-in reviews.
  const testimonials = useTestimonials('about', FALLBACK_TESTIMONIALS);
  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* 1. Hero                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-75 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-800 to-blue-500 px-4 lg:min-h-125"
        >
          <HeroBackground image={pageImages.hero} />
          {/* Decorative accents — hidden from assistive tech. */}
          <Butterfly className="absolute left-[6%] top-[18%] w-16 text-white opacity-20 lg:w-24" />
          <Flower className="absolute right-[8%] top-[22%] w-12 text-white opacity-20 lg:w-20" />
          <Cloud className="absolute bottom-[12%] left-[14%] w-24 text-white opacity-20 lg:w-40" />
          <Circle className="absolute -right-8 -bottom-10 w-40 text-white opacity-20 lg:w-64" />

          <div className="relative z-10 mx-auto max-w-3xl py-16 text-center">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-hero"
              id="hero-heading"
              className="text-3xl font-bold text-white md:text-4xl lg:text-5xl"
            >
              <h1 id="hero-heading" className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
                Little Smarties Nursery
              </h1>
            </EditableHeading>
            <EditableProse sections={sections} sectionKey="nursery-hero">
              <p className="mt-4 text-lg text-blue-50 md:text-xl">
                Committed to nurturing young minds since 2007
              </p>
            </EditableProse>
          </div>
        </section>

        {/* Video assigned in admin -> Gallery -> Videos. Renders nothing when
            none is set for this page. */}
        <PageVideo pageSlug="nursery" heading="Take a look" />

        {/* ---------------------------------------------------------------- */}
        {/* 2. Brief intro                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="intro-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 md:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
            {/* The first uploaded feature image, or the tinted placeholder
                this section has always shown when none is set. */}
            {pageImages.feature_1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cloudinaryResize(pageImages.feature_1.url, 600, 450)}
                srcSet={buildSrcSet(pageImages.feature_1.url, CARD_WIDTHS, { naturalWidth: pageImages.feature_1.width, ratio: 3 / 4 })}
                sizes='(max-width: 1024px) calc(100vw - 32px), 576px'
                alt={pageImages.feature_1.alt_text || 'Little Smarties Early Learning Centre'}
                className="order-1 aspect-4/3 w-full rounded-lg object-cover shadow-md"
              />
            ) : (
              <div
                className="order-1 aspect-4/3 w-full rounded-lg bg-gradient-to-br from-blue-100 to-blue-200"
                role="img"
                aria-label="Little Smarties Early Learning Centre"
              />
            )}

            <div className="order-2 p-0 md:p-2 lg:p-4">
              {/* A heading typed in the panel replaces this one. */}
              <EditableHeading
                sections={sections}
                sectionKey="intro"
                id="intro-heading"
                className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
              >
                <h2
                  id="intro-heading"
                  className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
                >
                  Little Smarties Early Learning Centre
                </h2>
              </EditableHeading>
              {/* admin -> Pages -> About -> Text. Each block keeps the wording
                  below until a replacement is published. */}
              <div className="space-y-4 text-base leading-relaxed text-gray-700">
                <EditableProse sections={sections} sectionKey="intro">
                  <p>
                    Little Smarties opened its doors in 2007 with a single room, a handful of
                    families and a straightforward idea: that the early years deserve the same care
                    and thought as any later stage of education.
                  </p>
                  <p>
                    Nearly two decades on, we have grown into a full early learning centre serving
                    children from infancy through to school readiness. What has not changed is the
                    scale at which we work — small groups, familiar faces, and teachers who know
                    every child by name and by temperament.
                  </p>
                </EditableProse>
                <EditableProse sections={sections} sectionKey="body">
                  <p>
                    Our teaching team combines formal training in early childhood education with
                    years of practical experience in the classroom. Many have been with us for the
                    better part of a decade, which gives our families the continuity that young
                    children rely on.
                  </p>
                  <p>
                    We hold ourselves to a simple standard: every child should leave at the end of
                    the day having been listened to, challenged a little, and kept safe.
                  </p>
                </EditableProse>
              </div>
            </div>
          </div>
        </section>

        {/* Remaining uploaded photographs. Skipped entirely when the slots are
            empty, so the page reads as before until images are added. */}
        {/* The strip that used to sit here drew feature_2 and feature_3, which
            the philosophy blocks below now illustrate. Keeping both would have
            published the same two photographs twice on one page. */}

        {/* ---------------------------------------------------------------- */}
        {/* 3. Mission, vision, values                                       */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="mvv-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-what-we-stand-for"
              id="mvv-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="mvv-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                What We Stand For
              </h2>
            </EditableHeading>
            <EditableProse sections={sections} sectionKey="nursery-what-we-stand-for">
              <p className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
                The commitments that shape how we teach, plan and care for every child in our rooms.
              </p>
            </EditableProse>

            <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
              {MISSION_VISION_VALUES.map((entry) => (
                <MissionCard
                  key={entry.key}
                  icon={entry.icon}
                  // Resolved to a string: it renders inside the card's own <h3>.
                  title={sections[entry.key]?.title?.trim() || entry.title}
                  content={
                    <EditableProse sections={sections} sectionKey={entry.key}>
                      {entry.content}
                    </EditableProse>
                  }
                  color={entry.color}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 4. Educational philosophy                                        */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="philosophy-heading" className="bg-white py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-philosophy"
              id="philosophy-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="philosophy-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                Our Educational Philosophy
              </h2>
            </EditableHeading>
            <EditableProse sections={sections} sectionKey="nursery-philosophy">
              <p className="mx-auto mb-12 max-w-2xl text-center text-base text-gray-600 md:mb-16 md:text-lg">
                Based on proven developmental psychology
              </p>
            </EditableProse>

            <div className="space-y-16 md:space-y-20">
              {PHILOSOPHY.map((entry, index) => {
                // The first two blocks take the page's feature slots; the
                // third keeps its tint, there being no third slot to fill it.
                const slot = PHILOSOPHY_SLOTS[index];
                const image = slot ? pageImages[slot] : undefined;

                return (
                <article
                  key={entry.key}
                  className={`grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12 ${
                    // Alternate which side the image sits on for large screens.
                    index % 2 === 1 ? 'lg:[&>figure]:order-2' : ''
                  }`}
                >
                  <figure className="m-0">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cloudinaryResize(image.url, 600, 400)}
                        srcSet={buildSrcSet(image.url, [400, 600, 1000], { naturalWidth: image.width, ratio: 2 / 3 })}
                        // Full width below lg, half the container above it.
                        sizes="(max-width: 1024px) calc(100vw - 32px), 576px"
                        alt={image.alt_text || entry.title}
                        loading="lazy"
                        className="aspect-3/2 w-full rounded-lg object-cover shadow-md"
                      />
                    ) : (
                      <div
                        className={`aspect-3/2 w-full rounded-lg bg-gradient-to-br ${entry.gradient}`}
                        role="img"
                        aria-label={entry.title}
                      />
                    )}
                  </figure>

                  <div>
                    {/* Resolved to a string: an override arrives as a <div>,
                        which cannot nest inside this <h3>. */}
                    <h3 className="mb-4 text-xl font-semibold text-gray-800 md:text-2xl">
                      {sections[entry.key]?.title?.trim() || entry.title}
                    </h3>
                    <EditableProse sections={sections} sectionKey={entry.key}>
                      <div className="space-y-4 text-base leading-relaxed text-gray-700">
                        {entry.paragraphs.map((paragraph) => (
                          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                        ))}
                      </div>
                    </EditableProse>
                  </div>
                </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Team                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="team-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-team"
              id="team-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="team-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                Meet Our Team
              </h2>
            </EditableHeading>
            <p className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
              Experienced professionals dedicated to your child&rsquo;s growth
            </p>

            <StaffCards staff={team} />
          </div>
        </section>

        <HandprintDivider />

        {/* ---------------------------------------------------------------- */}
        {/* 6. Testimonials                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="testimonials-heading" className="bg-blue-50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-testimonials"
              id="testimonials-heading"
              className="mb-10 text-center text-2xl font-bold text-gray-800 md:mb-12 md:text-3xl lg:text-4xl"
            >
              <h2
                id="testimonials-heading"
                className="mb-10 text-center text-2xl font-bold text-gray-800 md:mb-12 md:text-3xl lg:text-4xl"
              >
                What Parents Say
              </h2>
            </EditableHeading>

            {/* Mobile and tablet: swipeable carousel. */}
            <div className="lg:hidden">
              <Carousel
                items={testimonials}
                ariaLabel="Parent testimonials"
                renderItem={(testimonial) => (
                  <div className="h-full px-1 pb-2">
                    <TestimonialCard testimonial={testimonial} />
                  </div>
                )}
              />
            </div>

            {/* Desktop: all four side by side. */}
            <div className="hidden gap-6 lg:grid lg:grid-cols-4 lg:gap-8">
              {testimonials.map((testimonial) => (
                <TestimonialCard key={testimonial.id} testimonial={testimonial} />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Call to action                                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="cta-heading"
          className="bg-gradient-to-r from-red-500 to-orange-500 py-16 md:py-20"
        >
          <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
            <EditableHeading
              sections={sections}
              sectionKey="nursery-cta"
              id="cta-heading"
              className="text-2xl font-bold text-white md:text-3xl lg:text-4xl"
            >
              <h2 id="cta-heading" className="text-2xl font-bold text-white md:text-3xl lg:text-4xl">
                Ready to give your child the best start?
              </h2>
            </EditableHeading>
            <p className="mt-4 text-base text-orange-50 md:text-lg">
              Register today, or come and see the rooms for yourself before you decide.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Button href="/register" variant="primary" size="lg">
                Register Now
              </Button>
              <Button href="/booking" variant="secondary" size="lg">
                Schedule Tour
              </Button>
            </div>
          </div>
        </section>
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageSections pageSlug="about" consumedKeys={CONSUMED_SECTION_KEYS} />

      </main>

      <Footer />
    </>
  );
}
