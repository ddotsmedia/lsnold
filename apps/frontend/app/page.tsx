'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections } from '@/components/PageSections';
import Modal from '@/components/Modal';
import HeroRotator, { HeroSlide } from '@/components/HeroRotator';
import {
  Butterfly,
  Flower,
  FlowerOutline,
  PaperAirplane,
  CloudScallop,
} from '@/components/Decorations';
import { PartnerLogo } from '@/components/PartnerLogo';
import { PageFeatureImages, PageBackground } from '@/components/PageFeatureImages';
import { usePageMedia, useAgeGroupImages, slugify } from '@/lib/media';
import { useAgeGroups, formatRange } from '@/lib/ageGroups';
import { usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import type { SiteImage } from '@/lib/media';
import { useTestimonials, type ApiTestimonial } from '@/lib/testimonials';

interface FeaturedVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  thumbnail_url: string | null;
}

interface AgeGroup {
  name: string;
  ageRange: string;
  description: string;
  icon: string;
  experiences: string[];
}

/**
 * Real copy pulled directly from the live production site
 * (littlesmartiesnursery.com) on 2026-08-05, so wording and program
 * names match what visitors already know.
 */
const ageGroups: AgeGroup[] = [
  {
    name: 'Bouncing Bunnies',
    ageRange: '0 - 1 year',
    description:
      'A warm, nurturing start for our tiniest learners with lots of cuddles, sensory play, and support.',
    icon: '🐰',
    experiences: [
      'Gentle care & feeding routines',
      'Tummy time and soft play',
      'Responsive caregiving',
      'Soothing music and bonding',
      'Safe, cozy spaces',
    ],
  },
  {
    name: 'Precious Pandas',
    ageRange: '1 - 2 years',
    description: 'Encouraging curiosity and independence in early walkers through playful learning.',
    icon: '🐼',
    experiences: [
      'Hands-on discovery play',
      'Language development support',
      'Sensory and motor activities',
      'Encouraging self-feeding',
      'Outdoor exploration',
    ],
  },
  {
    name: 'Gentle Giraffes',
    ageRange: '2 - 3 years',
    description: 'Developing communication and social-emotional skills through structured play.',
    icon: '🦒',
    experiences: [
      'Circle time and storytelling',
      'Creative expression activities',
      'Fine motor skills practice',
      'Peer interaction',
      'Simple routines and structure',
    ],
  },
  {
    name: 'Dazzling Dolphins',
    ageRange: '3 - 4 years',
    description: 'Fostering confidence, imagination, and cognitive growth in a vibrant environment.',
    icon: '🐬',
    experiences: [
      'Phonics and early math',
      'Role play and drama',
      'Group projects and sharing',
      'Outdoor learning zones',
      'Building self-esteem',
    ],
  },
  {
    name: 'Fuzzy Foxes',
    ageRange: '4 - 5 years',
    description: 'Ready for school with structured curriculum and focus on independence.',
    icon: '🦊',
    experiences: [
      'Reading and number concepts',
      'Problem-solving and logic',
      'Teamwork and leadership',
      'Creative arts and music',
      'Pre-school assessments',
    ],
  },
  {
    name: 'Cuddly Camel',
    ageRange: '4 - 5 years',
    description:
      'Supportive learning for confident, curious learners preparing to transition to primary school.',
    icon: '🐫',
    experiences: [
      'Advanced literacy and numeracy',
      'Personal and social skills',
      'Learning through inquiry',
      'Confidence-building tasks',
      'Smooth transition preparation',
    ],
  },
];

/**
 * Real reviews as published on the live site, kept as the fallback for when
 * the API is unreachable or nothing is published. Migration 025 seeded the
 * database from this list, so the two agree.
 */
const FALLBACK_TESTIMONIALS: ApiTestimonial[] = [
  {
    quote:
      'My son absolutely loved it here! The principal was kind and inspiring, and the teachers were loving and caring. Thank you Little Smarties for setting the perfect foundation for our children.',
    author_name: 'Al Salam St, Abu Dhabi', author_title: null, author_image_url: null, rating: null, id: 'Al Salam St, Abu Dhabi',
  },
  {
    quote:
      'The kindest staff and great attention to small details and hygiene. My little girl loves it! I especially love how they engage the kids in Arabic culture and language through their curriculum.',
    author_name: 'Hasnaa Bahajjoub', author_title: null, author_image_url: null, rating: null, id: 'Hasnaa Bahajjoub',
  },
  {
    quote:
      'The nursery exceeded all of my expectations. The staff is friendly, knowledgeable, and the facility is clean and well maintained. I highly recommend it to anyone.',
    author_name: 'Nuha Mohammed Abujame', author_title: null, author_image_url: null, rating: null, id: 'Nuha Mohammed Abujame',
  },
  {
    quote: 'One of the best nurseries in terms of care and education. The location is awesome!',
    author_name: 'Fatma Ali', author_title: null, author_image_url: null, rating: null, id: 'Fatma Ali',
  },
];

interface Partner {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
}

/**
 * Slugs for the six groups above, derived the same way the admin panel derives
 * them, so an image uploaded there is found here under the same key.
 */
const HOME_AGE_GROUP_SLUGS: readonly string[] = ageGroups.map((g) => slugify(g.name));

/**
 * The carousel slots, in the order they play. Each is an image uploaded in
 * admin -> Media Library -> Pages -> Home, delivered from Cloudinary.
 */
const HERO_SLOTS = ['hero', 'hero_2', 'hero_3', 'hero_4', 'hero_5'] as const;

/**
 * The slides as they were before the images were moved into the database:
 * files in public/images, shown with setInterval + a Tailwind opacity
 * crossfade (see HeroRotator.tsx), no carousel library.
 *
 * Kept as the fallback for when no hero slot is filled — a first deploy, or an
 * admin who clears every slot. The home page must never render an empty hero.
 */
const HERO_SLIDES: HeroSlide[] = [
  { src: '/images/hero-1.png', alt: 'Little Smarties Nursery event' },
  { src: '/images/hero-2.jpeg', alt: 'Children celebrating UAE National Day' },
  { src: '/images/hero-3.png', alt: 'Outdoor garden learning at Little Smarties' },
  { src: '/images/hero-4.png', alt: 'Little Smarties Nursery outdoor activities' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState(0);
  const [testimonialStart, setTestimonialStart] = useState(0);
  // Images uploaded in admin -> Media Library -> Pages -> Home. usePageMedia
  // fails quiet, so a request problem leaves the page exactly as it was.
  const pageImages = usePageMedia('home');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('home'));

  // Managed in admin -> Testimonials. Falls back to the built-in reviews when
  // nothing is published for this page or the request fails.
  const testimonials = useTestimonials('home', FALLBACK_TESTIMONIALS);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [featuredVideo, setFeaturedVideo] = useState<FeaturedVideo | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Partners managed in admin → Partners. A failure leaves the list empty and
  // the section shows its own message rather than breaking the page.
  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/partners`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { partners?: Partner[] }) => {
        if (!cancelled) setPartners(Array.isArray(data?.partners) ? data.partners : []);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setPartnersLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/youtube-videos`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: FeaturedVideo[]) => {
        if (cancelled) return;
        setFeaturedVideo(Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
      })
      // Backend unreachable: fall through to the placeholder, never an error.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setVideoLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // The rotator plays whichever hero slots are filled, in slot order. The four
  // original photographs now live in hero_2..hero_5, so this reads the same
  // rotation it always did — only every slide is now replaceable from the admin
  // panel. Falls back to the bundled files when no slot is filled.
  const uploadedSlides: HeroSlide[] = HERO_SLOTS
    .map((slot) => pageImages[slot])
    .filter((image): image is SiteImage => Boolean(image))
    .map((image) => ({ src: image.url, alt: image.alt_text || 'Little Smarties Nursery' }));

  const heroSlides: HeroSlide[] = uploadedSlides.length > 0 ? uploadedSlides : HERO_SLIDES;

  // Photographs uploaded in admin -> Age Groups, and the editable rows.
  // Merged over the copy below rather than replacing it: the experiences
  // list has no database column, so swapping the array out would delete it.
  const groupImages = useAgeGroupImages(HOME_AGE_GROUP_SLUGS);
  const groupRecords = useAgeGroups();

  const baseGroup = ageGroups[activeTab];
  const activeSlug = baseGroup ? slugify(baseGroup.name) : null;
  const activeRecord = activeSlug ? groupRecords[activeSlug] : undefined;
  const activePhoto = activeSlug ? groupImages[activeSlug]?.hero : null;

  const activeGroup = baseGroup && {
    ...baseGroup,
    name: activeRecord?.name ?? baseGroup.name,
    description: activeRecord?.description ?? baseGroup.description,
    ageRange: activeRecord
      ? formatRange(activeRecord.min_age_months, activeRecord.max_age_months)
      : baseGroup.ageRange,
  };

  const visibleTestimonials = [0, 1, 2].map(
    (offset) => testimonials[(testimonialStart + offset) % testimonials.length]
  );

  return (
    <>
      <Header />

      <main className="overflow-hidden">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-blue-900">
          <HeroRotator slides={heroSlides} intervalMs={6000} />
          <div className="pointer-events-none absolute inset-0 bg-black/25" />
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute left-[10%] top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            <div className="absolute right-[16%] top-16 h-32 w-32 rounded-full bg-white/10 blur-xl" />
            <div className="absolute bottom-16 left-[30%] h-20 w-20 rounded-full bg-white/10 blur-xl" />
          </div>

          <div className="relative z-10 flex min-h-[420px] flex-col items-center justify-center px-4 py-24 text-center sm:min-h-[480px] sm:py-28">
            <h1 className="font-display text-5xl leading-tight text-white drop-shadow-sm sm:text-6xl lg:text-7xl">
              Welcome to
              <br />
              Little Smarties Nursery
            </h1>
            <Link href="/nursery" className="mt-8">
              <button className="h-12 rounded-full bg-red-600 px-8 font-bold text-white shadow-lg transition-transform hover:scale-105 sm:h-14 sm:px-10">
                Explore Now
              </button>
            </Link>
          </div>

          <CloudScallop className="relative text-white" />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Intro                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-white py-20 sm:py-28">
          <FlowerOutline className="pointer-events-none absolute right-[6%] top-10 hidden w-16 opacity-40 sm:block" />
          <FlowerOutline className="pointer-events-none absolute -bottom-4 right-[22%] hidden w-12 rotate-12 opacity-30 sm:block" />
          <Butterfly className="pointer-events-none absolute bottom-10 left-[6%] w-14 opacity-80 sm:w-16" />
          <PaperAirplane className="pointer-events-none absolute right-[8%] top-8 w-12 -rotate-12 opacity-70 sm:w-14" />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
            <div>
              {/* admin -> Pages -> Home -> Text -> Heading replaces this. */}
              <EditableHeading
                sections={sections}
                sectionKey="intro"
                className="font-display text-4xl sm:text-5xl"
              >
                <h2 className="font-display text-4xl sm:text-5xl">
                  <span className="text-red-600">Little Smarties</span> Early Learning Centre
                </h2>
              </EditableHeading>
              {/* admin -> Pages -> Home -> Text. Falls back to the wording
                  below until someone publishes a replacement. */}
              <div className="mt-5 leading-relaxed text-gray-600">
                <EditableProse sections={sections} sectionKey="intro">
                  <p>
                    Little Smarties Nursery was founded in 2007 and has since then been committed to
                    providing the highest international standards of child care. LSN has been
                    identified by ADEK as nursery with a high level of compliance and academic
                    quality.
                  </p>
                </EditableProse>
                <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
              </div>
              <Link href="/nursery" className="mt-7 inline-block">
                <button className="h-12 rounded-full bg-red-600 px-7 font-bold text-white shadow-md transition-transform hover:scale-105">
                  Read More →
                </button>
              </Link>
            </div>

            <div className="relative mx-auto aspect-[4/3] w-full max-w-md">
              <div className="absolute -left-6 -top-6 h-16 w-16 rounded-full bg-red-500/30" />
              <div className="absolute -bottom-6 -right-4 h-20 w-20 rounded-full bg-blue-500/30" />
              {/* Media Library -> Pages -> Home -> About photo. Until one is
                  uploaded this keeps the tinted tile the section has always
                  shown, so the layout never collapses. */}
              <div className="relative flex h-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 via-white to-amber-50 shadow-xl">
                {pageImages.about ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pageImages.about.url}
                    alt={pageImages.about.alt_text || 'Little Smarties Nursery'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <div className="text-6xl" aria-hidden="true">🧩</div>
                    <p className="mt-2 text-sm font-semibold text-blue-800">Photo coming soon</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Uploaded photographs. Skipped entirely while the slots are empty,
            so the page reads as before until images are added. */}
        <PageFeatureImages images={pageImages} className="bg-white pb-20 sm:pb-28" />

        {/* ---------------------------------------------------------------- */}
        {/* Age Groups — tabbed selector                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-white py-20 sm:py-28">
          <FlowerOutline className="pointer-events-none absolute left-[3%] top-24 hidden w-20 opacity-30 lg:block" />
          <FlowerOutline className="pointer-events-none absolute right-[3%] top-10 hidden w-20 rotate-6 opacity-30 lg:block" />
          <PaperAirplane className="pointer-events-none absolute right-[12%] top-6 w-14 rotate-12 opacity-60" />
          <Butterfly className="pointer-events-none absolute left-[4%] top-16 w-14 opacity-70" />

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-4xl text-red-600 sm:text-5xl">Our Age Groups</h2>
              <p className="mt-3 text-gray-500">
                Tailored programs for every stage of your child&apos;s development journey
              </p>
            </div>

            {/* Tab bar */}
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {ageGroups.map((group, idx) => {
                const isActive = idx === activeTab;
                // Same merge as the detail panel, so a rename in admin shows on
                // the tab as well as in the heading it opens.
                const record = groupRecords[slugify(group.name)];
                const label = record?.name ?? group.name;
                const range = record
                  ? formatRange(record.min_age_months, record.max_age_months)
                  : group.ageRange;
                return (
                  <button
                    key={group.name}
                    onClick={() => setActiveTab(idx)}
                    className={`rounded-lg border px-4 py-2.5 text-center text-sm font-semibold transition-all ${
                      isActive
                        ? 'border-red-600 bg-red-600 text-white shadow-md'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-red-200'
                    }`}
                  >
                    <div>{label}</div>
                    <div className={`text-[11px] font-normal ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                      {range}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:items-start">
              <div>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-3xl">
                  {activeGroup.icon}
                </div>
                <h3 className="mt-5 font-display text-3xl text-gray-900">{activeGroup.name}</h3>
                <p className="mt-4 text-gray-600">{activeGroup.description}</p>

                <ul className="mt-5 space-y-2.5">
                  {activeGroup.experiences.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-gray-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-amber-50 shadow-lg">
                {/* The photograph uploaded for this group, when there is one.
                    The emoji stays as the fallback rather than being removed:
                    a group with no image yet would otherwise show an empty
                    gradient box, which reads as a broken picture. */}
                {activePhoto ? (
                  <img
                    src={activePhoto.url}
                    alt={activePhoto.alt_text || activeGroup.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl">
                    {activeGroup.icon}
                  </div>
                )}
                <span className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                  {activeGroup.ageRange}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Testimonials                                                      */}
        {/* ---------------------------------------------------------------- */}
        <PageBackground
          image={pageImages.background}
          className="relative overflow-hidden py-20 sm:py-28"
          fallbackClassName="bg-white"
        >
          <div className="pointer-events-none absolute left-[6%] top-16 h-4 w-4 rounded-full bg-amber-300" />
          <div className="pointer-events-none absolute right-[10%] top-24 h-3 w-3 rounded-full bg-blue-300" />
          <div className="pointer-events-none absolute bottom-24 left-[14%] h-3 w-3 rounded-full bg-pink-300" />
          <div className="pointer-events-none absolute bottom-16 right-[8%] h-4 w-4 rounded-full bg-green-300" />

          <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-4xl leading-tight text-red-600 sm:text-5xl">
              Our Parents Are
              <br />
              Our True Ambassadors!
            </h2>
            <p className="mt-3 text-gray-500">
              Hear from families who have experienced the Little Smarties difference
            </p>

            <div className="mt-12 flex items-center justify-center gap-3 sm:gap-6">
              <button
                aria-label="Previous slide"
                onClick={() =>
                  setTestimonialStart((i) => (i === 0 ? testimonials.length - 1 : i - 1))
                }
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition-colors hover:border-red-600 hover:text-red-600"
              >
                ‹
              </button>

              <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-3">
                {visibleTestimonials.map((t, idx) => (
                  <div
                    key={`${t.id}-${idx}`}
                    className="relative rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-sm"
                  >
                    {/* Only drawn when a rating was given. These reviews were
                        shown with five hardcoded stars regardless; a review
                        with no rating should not claim one. */}
                    {t.rating ? (
                      <div className="mb-2 text-amber-400" aria-label={`${t.rating} out of 5 stars`}>
                        {'★'.repeat(t.rating)}
                        <span className="text-gray-300">{'★'.repeat(5 - t.rating)}</span>
                      </div>
                    ) : null}
                    <p className="text-sm italic leading-relaxed text-gray-600">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      {t.author_image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.author_image_url}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <p className="text-sm font-bold text-gray-900">{t.author_name}</p>
                        {t.author_title && (
                          <p className="text-xs text-gray-500">{t.author_title}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                aria-label="Next slide"
                onClick={() => setTestimonialStart((i) => (i + 1) % testimonials.length)}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition-colors hover:border-red-600 hover:text-red-600"
              >
                ›
              </button>
            </div>

            <p className="mt-10 text-sm font-semibold text-gray-700">
              Join our community of happy families!
            </p>
          </div>
        </PageBackground>

        {/* ---------------------------------------------------------------- */}
        {/* Partners                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-white pb-20 sm:pb-28">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-4xl text-red-600 sm:text-5xl">Our Partners</h2>

            {partnersLoading ? (
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />
                ))}
              </div>
            ) : partners.length === 0 ? (
              <p className="mt-6 text-base text-gray-600">No partners yet.</p>
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-6">
                {partners.map((partner) => (
                  <PartnerLogo
                    key={partner.id}
                    name={partner.name}
                    logoUrl={partner.logo_url}
                    websiteUrl={partner.website_url}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Featured video                                                    */}
        {/*                                                                   */}
        {/* Sits last so the page runs white content -> blue -> dark footer.  */}
        {/* Hidden until the fetch settles, so an empty band never flashes in */}
        {/* before the video arrives.                                         */}
        {/* ---------------------------------------------------------------- */}
        {videoLoaded && (
          <section
            aria-labelledby="featured-video-heading"
            className="bg-gradient-to-br from-blue-600 to-blue-800 py-16 sm:py-20 lg:py-24"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {featuredVideo ? (
                <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 lg:gap-14">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(true)}
                    aria-label={`Play video: ${featuredVideo.title}`}
                    className="group relative block w-full overflow-hidden rounded-2xl shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        featuredVideo.thumbnail_url ||
                        `https://img.youtube.com/vi/${featuredVideo.youtube_id}/hqdefault.jpg`
                      }
                      alt={`Thumbnail for ${featuredVideo.title}`}
                      className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-xl transition-transform duration-200 group-hover:scale-110 sm:h-20 sm:w-20">
                        <svg
                          width={24}
                          height={24}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                          className="ml-1 text-blue-700 sm:h-8 sm:w-8"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </button>

                  <div className="text-white">
                    <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                      Featured Video
                    </span>
                    <h2
                      id="featured-video-heading"
                      className="mt-4 font-display text-3xl leading-tight sm:text-4xl lg:text-5xl"
                    >
                      {featuredVideo.title}
                    </h2>
                    {featuredVideo.description && (
                      <p className="mt-4 text-base leading-relaxed text-blue-50 sm:text-lg">
                        {featuredVideo.description}
                      </p>
                    )}

                    <div className="mt-8 flex flex-col items-start gap-4">
                      <button
                        type="button"
                        onClick={() => setIsPlaying(true)}
                        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-8 font-bold text-blue-700 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
                      >
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch Video
                      </button>

                      <Link
                        href="/gallery?tab=videos"
                        className="text-sm font-semibold text-white underline-offset-4 transition-opacity hover:underline hover:opacity-90"
                      >
                        See More Videos →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-white">
                  <h2 id="featured-video-heading" className="font-display text-3xl sm:text-4xl">
                    Videos
                  </h2>
                  <p className="mt-3 text-base text-blue-50 sm:text-lg">
                    Check back soon for videos from our nursery.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageSections pageSlug="home" />

      </main>

      <Footer />

      <Modal
        isOpen={isPlaying && featuredVideo !== null}
        onClose={() => setIsPlaying(false)}
        title={featuredVideo?.title ?? ''}
        size="lg"
      >
        {featuredVideo && (
          <div>
            {/* Mounted only on open, so no request reaches YouTube until asked. */}
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${featuredVideo.youtube_id}?autoplay=1&rel=0`}
                title={featuredVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
            {featuredVideo.description && (
              <p className="mt-4 text-base leading-relaxed text-gray-700">
                {featuredVideo.description}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
