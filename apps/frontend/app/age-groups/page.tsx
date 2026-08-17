'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { PageFeatureImages } from '@/components/PageFeatureImages';
import { HeroBackground } from '@/components/HeroBackground';
import { Button } from '@/components/Button';
import { AgeGroupCard, type AgeGroupColor } from '@/components/AgeGroupCard';
import { QuickFactsCard } from '@/components/QuickFactsCard';
import { Butterfly, Flower } from '@/components/Decorations';
import { useAgeGroupMedia, useAgeGroupIcons, usePageMedia, slugify } from '@/lib/media';
import type { SiteImage } from '@/lib/media';
import { Modal } from '@/components/Modal';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

interface RoutineEntry {
  time: string;
  activity: string;
}

interface AgeGroup {
  id: number;
  emoji: string;
  name: string;
  range: string;
  color: AgeGroupColor;
  description: string;
  detailedDescription: readonly string[];
  focusAreas: readonly string[];
  dailyRoutine: readonly RoutineEntry[];
  sampleActivities: readonly string[];
  educatorApproach: string;
  ratio: string;
  classSize: string;
  focusHours: string;
  enrichment: string;
  /** Tailwind gradient for the placeholder image in the detail panel. */
  gradient: string;
}

/** Module scope so the array identity is stable across renders. */
const AGE_GROUP_SLUGS: readonly string[] = [
  'bouncing-bunnies',
  'precious-pandas',
  'gentle-giraffes',
  'dazzling-dolphins',
  'fuzzy-foxes',
  'cuddly-camels',
];

const AGE_GROUPS: readonly AgeGroup[] = [
  {
    id: 1,
    emoji: '🐰',
    name: 'Bouncing Bunnies',
    range: '0-1 year',
    color: 'pink',
    description: 'A warm, nurturing introduction to the world',
    detailedDescription: [
      'The first year is about trust before anything else. Babies in this room are settled by a small, consistent team who learn their cues quickly — how they like to be held, when they get tired, what soothes them on a difficult morning.',
      'Days follow each baby, not a timetable. Feeding, sleeping and play happen when the individual child needs them, and we keep a written record of each so families always know exactly how the day went.',
    ],
    focusAreas: [
      'Sensory exploration',
      'Bonding and attachment',
      'Motor development',
      'Music and rhythm',
      'Comfort and security',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & free play' },
      { time: '7:30', activity: 'Breakfast & feeding' },
      { time: '8:30', activity: 'Tummy time & sensory play' },
      { time: '9:00', activity: 'Music and movement' },
      { time: '9:30', activity: 'Nap time' },
      { time: '10:30', activity: 'Snack & play' },
      { time: '12:00', activity: 'Lunch & feeding' },
      { time: '13:00', activity: 'Quiet time' },
    ],
    sampleActivities: [
      'Tummy time with soft toys',
      'Baby massage and sensory exploration',
      'High-contrast visual stimulation',
      'Singing and gentle music',
    ],
    educatorApproach:
      "Our infant program is based on responsive caregiving. We recognize each baby's unique needs and respond with warmth, consistency, and gentle touch. Our teachers build secure attachments while supporting early development through sensory exploration, music, and movement.",
    ratio: '1:3 (1 caregiver per 3 babies)',
    classSize: 'Max 9 babies',
    focusHours: 'Full day care',
    enrichment: 'Music, sensory play, tummy time',
    gradient: 'from-pink-100 to-pink-200',
  },
  {
    id: 2,
    emoji: '🐼',
    name: 'Precious Pandas',
    range: '1-2 years',
    color: 'purple',
    description: 'Moving, talking, and exploring with confidence',
    detailedDescription: [
      'Once children are on their feet, the room has to keep up with them. This space is built for movement, with low furniture to cruise along, safe surfaces to fall on, and plenty of room to practise walking, climbing and carrying things about.',
      'Language takes off in this year, so our teachers narrate the day out loud — naming what children are doing, echoing their attempts back, and giving every sound and gesture a response worth making.',
    ],
    focusAreas: [
      'Language development',
      'Walking and mobility',
      'Social interaction',
      'Fine motor skills',
      'Independence building',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & free exploration' },
      { time: '7:45', activity: 'Breakfast' },
      { time: '8:30', activity: 'Circle time & songs' },
      { time: '9:00', activity: 'Structured play activity' },
      { time: '9:30', activity: 'Outdoor exploration' },
      { time: '10:15', activity: 'Snack time' },
      { time: '10:45', activity: 'Art or sensory play' },
      { time: '11:30', activity: 'Lunch' },
      { time: '12:30', activity: 'Rest time' },
    ],
    sampleActivities: [
      'Singing games with hand motions',
      'Exploring different textures and materials',
      'Simple art with washable paints',
      'Dancing and movement to music',
    ],
    educatorApproach:
      'We encourage toddlers to explore their growing independence while providing a secure base. Activities are designed to support language development through songs, stories, and conversation. We celebrate every attempt and encourage self-expression.',
    ratio: '1:5 (1 caregiver per 5 toddlers)',
    classSize: 'Max 15 toddlers',
    focusHours: 'Full day care',
    enrichment: 'Music, movement, art, sensory exploration',
    gradient: 'from-purple-100 to-purple-200',
  },
  {
    id: 3,
    emoji: '🦒',
    name: 'Gentle Giraffes',
    range: '2-3 years',
    color: 'blue',
    description: 'Growing minds, creative hearts, independent spirits',
    detailedDescription: [
      'Two-year-olds have strong opinions and not always the words for them. Our room is organised into learning centres children can choose between, because being able to decide where to go next takes the heat out of a great many frustrations.',
      'This is also the year that friendships start. We stay close during play to help with the hard parts — taking turns, waiting, joining in — and give children the words for what they are feeling rather than settling disputes for them.',
    ],
    focusAreas: [
      'Creative expression',
      'Language expansion',
      'Self-regulation',
      'Social skills',
      'Fine motor development',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & choice time' },
      { time: '8:00', activity: 'Breakfast' },
      { time: '8:30', activity: 'Circle time & literacy' },
      { time: '9:00', activity: 'Learning centers rotation' },
      { time: '10:00', activity: 'Art or music' },
      { time: '10:30', activity: 'Outdoor play' },
      { time: '11:15', activity: 'Lunch' },
      { time: '12:15', activity: 'Quiet time/nap' },
      { time: '14:30', activity: 'Snack & play' },
    ],
    sampleActivities: [
      'Painting and drawing',
      'Dramatic play and dress-up',
      'Simple puzzles and sorting games',
      'Gardening and nature exploration',
    ],
    educatorApproach:
      'We foster creativity and independence while gently guiding social-emotional development. Our learning centers offer choices that promote exploration and discovery. We support language growth through storytelling and conversation, and celebrate creativity in all its forms.',
    ratio: '1:8 (1 caregiver per 8 children)',
    classSize: 'Max 16 children',
    focusHours: 'Full day care',
    enrichment: 'Art, music, drama, nature exploration',
    gradient: 'from-blue-100 to-blue-200',
  },
  {
    id: 4,
    emoji: '🐬',
    name: 'Dazzling Dolphins',
    range: '3-4 years',
    color: 'red',
    description: 'Social butterflies discovering academic foundations',
    detailedDescription: [
      'Three-year-olds want to know how everything works and who they can do it with. Small group work becomes a bigger part of the day, and children start taking on tasks that need more than one person to finish.',
      'Early literacy and numeracy arrive here, but through games, stories and hands-on materials rather than worksheets. The aim is that children arrive at letters and numbers already curious about them.',
    ],
    focusAreas: [
      'Pre-academic skills',
      'Social cooperation',
      'Problem-solving',
      'Physical development',
      'Confidence building',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & morning meeting' },
      { time: '8:00', activity: 'Breakfast' },
      { time: '8:30', activity: 'Circle & language lesson' },
      { time: '9:00', activity: 'Small group learning' },
      { time: '9:45', activity: 'Center time (rotation)' },
      { time: '10:30', activity: 'Outdoor play & sports' },
      { time: '11:15', activity: 'Lunch' },
      { time: '12:15', activity: 'Quiet time/read-aloud' },
      { time: '13:15', activity: 'Afternoon learning' },
    ],
    sampleActivities: [
      'Number and letter games',
      'Science experiments and observations',
      'Team sports and outdoor games',
      'Group projects and cooperative activities',
    ],
    educatorApproach:
      'We introduce foundational academic concepts through play-based learning. Our curriculum balances social-emotional development with early literacy and numeracy. We emphasize teamwork, respect for others, and developing confidence through successful experiences.',
    ratio: '1:10 (1 caregiver per 10 children)',
    classSize: 'Max 20 children',
    focusHours: 'Full day care',
    enrichment: 'Sports, science, art, music, theater',
    gradient: 'from-red-100 to-orange-100',
  },
  {
    id: 5,
    emoji: '🦊',
    name: 'Fuzzy Foxes',
    range: '4-5 years',
    color: 'green',
    description: 'Ready for school with academic confidence and social skills',
    detailedDescription: [
      'This is the year before school, and the day is structured to match — longer blocks of focused work, clearer expectations, and more responsibility for managing their own materials and time.',
      'We work on the habits that make school go well as much as the academics: listening in a group, finishing something that has become difficult, asking for help, and speaking up in front of others.',
    ],
    focusAreas: [
      'Academic readiness',
      'Leadership development',
      'Complex problem-solving',
      'Teamwork',
      'Emotional intelligence',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & morning circle' },
      { time: '8:00', activity: 'Breakfast' },
      { time: '8:30', activity: 'Literacy instruction' },
      { time: '9:15', activity: 'Math and reasoning' },
      { time: '10:00', activity: 'Science or social studies' },
      { time: '10:45', activity: 'Outdoor play & PE' },
      { time: '11:30', activity: 'Lunch' },
      { time: '12:30', activity: 'Project-based learning' },
      { time: '13:30', activity: 'Arts, music, or enrichment' },
    ],
    sampleActivities: [
      'Reading comprehension and writing',
      'Math problem-solving projects',
      'Science investigations and experiments',
      'Debates and group discussions',
    ],
    educatorApproach:
      'We prepare children for academic success while nurturing their love of learning. Our curriculum integrates literacy, numeracy, science, and social studies through engaging, project-based activities. We develop critical thinking, creativity, and leadership skills.',
    ratio: '1:12 (1 caregiver per 12 children)',
    classSize: 'Max 24 children',
    focusHours: 'Full day care',
    enrichment: 'Advanced academics, sports, arts, leadership',
    gradient: 'from-green-100 to-emerald-200',
  },
  {
    id: 6,
    emoji: '🐫',
    name: 'Cuddly Camels',
    range: '4-5 years Advanced',
    color: 'yellow',
    description: 'Extended curriculum for advanced learners and enrichment',
    detailedDescription: [
      'Some children in their pre-school year are ready to go further and stay with a subject longer than the standard programme allows. This group is built for them, with projects that run over several weeks rather than a single session.',
      'Children take on real responsibility here — planning their own work, mentoring younger groups, and presenting what they have made to an audience. Placement is by readiness, discussed with families first.',
    ],
    focusAreas: [
      'Advanced academics',
      'Extended projects',
      'Leadership roles',
      'Creative exploration',
      'Preparation for transition',
    ],
    dailyRoutine: [
      { time: '7:00', activity: 'Arrival & planning circle' },
      { time: '8:00', activity: 'Breakfast' },
      { time: '8:30', activity: 'Advanced literacy' },
      { time: '9:15', activity: 'Advanced math & logic' },
      { time: '10:00', activity: 'Enrichment projects' },
      { time: '11:00', activity: 'Sports & outdoor learning' },
      { time: '11:45', activity: 'Lunch' },
      { time: '12:45', activity: 'Extended projects' },
      { time: '13:45', activity: 'Special interest classes' },
    ],
    sampleActivities: [
      'Multi-week research projects',
      'Leadership and mentoring roles',
      'Advanced STEM learning',
      'Entrepreneurship and creation activities',
    ],
    educatorApproach:
      'Our advanced program supports highly engaged learners through extended projects and deeper exploration. We encourage independent research, leadership opportunities, and creative expression. This program prepares children for successful school transitions with confidence and academic skills.',
    ratio: '1:12 (1 caregiver per 12 children)',
    classSize: 'Max 24 children',
    focusHours: 'Full day care',
    enrichment: 'Advanced academics, projects, leadership, special classes',
    gradient: 'from-yellow-100 to-amber-200',
  },
];

const DETAIL_SECTION_ID = 'age-group-detail';

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function AgeGroupsPage() {
  // Page-level images, separate from the per-age-group ones below.
  const pageImages = usePageMedia('age-groups');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('age-groups'));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  // Only a card click should pull the page down to the detail panel; stepping
  // with Previous/Next leaves the reader where they already are.
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (selectedIndex === null || !shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    detailRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [selectedIndex, prefersReducedMotion]);

  const selectGroup = useCallback((index: number) => {
    shouldScrollRef.current = true;
    setSelectedIndex(index);
  }, []);

  const goToPrevious = useCallback(() => {
    setSelectedIndex((current) => (current === null || current === 0 ? current : current - 1));
  }, []);

  const goToNext = useCallback(() => {
    setSelectedIndex((current) =>
      current === null || current === AGE_GROUPS.length - 1 ? current : current + 1,
    );
  }, []);

  const selected = selectedIndex === null ? null : (AGE_GROUPS[selectedIndex] ?? null);

  // Images uploaded for this group in the admin Media Library. The slug is
  // derived from the name the same way the admin panel derives it.
  const ageGroupImages = useAgeGroupMedia(selected ? slugify(selected.name) : null);
  const heroImage = ageGroupImages.hero;
  const galleryImages = ageGroupImages.gallery;

  /** Enlarged gallery image, so a photo can be seen at a useful size. */
  const [lightbox, setLightbox] = useState<SiteImage | null>(null);

  // Icons for every card, fetched once rather than per card.
  const groupIcons = useAgeGroupIcons(AGE_GROUP_SLUGS);
  const previousGroup =
    selectedIndex === null || selectedIndex === 0 ? null : AGE_GROUPS[selectedIndex - 1];
  const nextGroup =
    selectedIndex === null || selectedIndex === AGE_GROUPS.length - 1
      ? null
      : AGE_GROUPS[selectedIndex + 1];

  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* 1. Hero                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-75 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-500 to-red-600 px-4 lg:min-h-125"
        >
          <HeroBackground image={pageImages.hero} />
          <Butterfly className="absolute left-[7%] top-[18%] w-16 text-white opacity-20 lg:w-24" />
          <Flower className="absolute right-[9%] top-[24%] w-12 text-white opacity-20 lg:w-20" />
          <Flower className="absolute bottom-[16%] left-[14%] w-14 text-white opacity-20 lg:w-24" />

          <div className="relative z-10 mx-auto max-w-3xl py-16 text-center">
            <h1
              id="hero-heading"
              className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
            >
              Our Age Groups
            </h1>
            <p className="mt-4 text-lg text-blue-50 drop-shadow md:text-xl">
              Programs tailored to each developmental stage
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Age group grid                                                */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="groups-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            {/* A heading typed in the panel replaces this one. */}
            <EditableHeading
              sections={sections}
              sectionKey="intro"
              id="groups-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="groups-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                Six Programs, One For Every Stage
              </h2>
            </EditableHeading>
            {/* admin -> Pages -> Age Groups -> Text. */}
            <div className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
              <EditableProse sections={sections} sectionKey="intro">
                <p>
                  Each group has its own room, its own rhythm and its own team. Select a group to
                  see how a day actually runs.
                </p>
              </EditableProse>
              <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
            </div>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10 lg:grid-cols-3">
              {AGE_GROUPS.map((group, index) => (
                <AgeGroupCard
                  key={group.id}
                  emoji={group.emoji}
                  iconUrl={groupIcons[slugify(group.name)]?.url}
                  iconAlt={groupIcons[slugify(group.name)]?.alt_text}
                  name={group.name}
                  range={group.range}
                  description={group.description}
                  color={group.color}
                  isSelected={selectedIndex === index}
                  controlsId={DETAIL_SECTION_ID}
                  onClick={() => selectGroup(index)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3-5. Detail panel, quick facts and navigation                    */}
        {/* ---------------------------------------------------------------- */}
        {selected && (
          <section
            id={DETAIL_SECTION_ID}
            ref={detailRef}
            aria-labelledby="detail-heading"
            aria-live="polite"
            // Clears the 70px sticky header when scrolled into view.
            className="scroll-mt-20 bg-white py-20 md:py-32"
          >
            <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                {/* An uploaded hero replaces the gradient placeholder. Until
                    one exists the emoji panel renders exactly as before. */}
                {heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroImage.url}
                    alt={heroImage.alt_text || `${selected.name}, ${selected.range}`}
                    className="aspect-5/6 w-full rounded-lg object-cover lg:sticky lg:top-24"
                  />
                ) : (
                  <div
                    className={`aspect-5/6 w-full rounded-lg bg-gradient-to-br ${selected.gradient} flex items-center justify-center lg:sticky lg:top-24`}
                    role="img"
                    aria-label={`${selected.name}, ${selected.range}`}
                  >
                    <span className="text-7xl md:text-8xl" aria-hidden="true">
                      {selected.emoji}
                    </span>
                  </div>
                )}

                {/* Content */}
                <div>
                  <h2
                    id="detail-heading"
                    className="text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
                  >
                    {selected.name}
                  </h2>
                  <p className="mt-1 text-lg text-gray-600 md:text-xl">{selected.range}</p>

                  <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-700">
                    {selected.detailedDescription.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                  </div>

                  {/* Ratio highlight */}
                  <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-medium text-gray-600">Caregiver-to-child ratio</p>
                    <p className="mt-1 text-lg font-bold text-blue-800">{selected.ratio}</p>
                  </div>

                  {/* Focus areas */}
                  <h3 className="mt-8 mb-3 text-xl font-semibold text-gray-800 md:text-2xl">
                    Focus Areas
                  </h3>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selected.focusAreas.map((area) => (
                      <li key={area} className="flex items-start gap-2 text-base text-gray-700">
                        <span className="mt-0.5 text-blue-500" aria-hidden="true">
                          ✓
                        </span>
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Daily routine */}
                  <h3 className="mt-8 mb-3 text-xl font-semibold text-gray-800 md:text-2xl">
                    A Day in {selected.name}
                  </h3>
                  <ol className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {selected.dailyRoutine.map((entry) => (
                      <li
                        key={`${entry.time}-${entry.activity}`}
                        className="flex items-baseline gap-4 px-4 py-3"
                      >
                        <span className="w-14 shrink-0 text-sm font-bold text-blue-800">
                          {entry.time}
                        </span>
                        <span className="text-base text-gray-700">{entry.activity}</span>
                      </li>
                    ))}
                  </ol>

                  {/* Sample activities */}
                  <h3 className="mt-8 mb-3 text-xl font-semibold text-gray-800 md:text-2xl">
                    Sample Activities
                  </h3>
                  <ul className="space-y-2">
                    {selected.sampleActivities.map((activity) => (
                      <li key={activity} className="flex items-start gap-2 text-base text-gray-700">
                        <span className="mt-0.5 text-red-600" aria-hidden="true">
                          •
                        </span>
                        <span>{activity}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Educator approach */}
                  <h3 className="mt-8 mb-3 text-xl font-semibold text-gray-800 md:text-2xl">
                    Our Approach
                  </h3>
                  <p className="text-base leading-relaxed text-gray-700">
                    {selected.educatorApproach}
                  </p>
                </div>
              </div>

              {/* Gallery
                  Images uploaded in admin -> Age Groups -> Programmes. The
                  whole block is skipped while a group has none, so a group
                  without photographs reads exactly as it did before. */}
              {galleryImages.length > 0 && (
                <>
                  <h3 className="mt-14 mb-6 text-xl font-semibold text-gray-800 md:text-2xl">
                    Inside {selected.name}
                  </h3>
                  {/* Scroll-snap on small screens, grid from sm up: a carousel
                      needs no library to feel right on a phone. */}
                  <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                    {galleryImages.map((image) => (
                      <li
                        key={image.id}
                        className="w-[78%] shrink-0 snap-center sm:w-auto"
                      >
                        <button
                          type="button"
                          onClick={() => setLightbox(image)}
                          className="block w-full overflow-hidden rounded-lg shadow-md transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 md:hover:scale-[1.02]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={image.alt_text || `${selected.name} at Little Smarties`}
                            loading="lazy"
                            className="aspect-4/3 w-full object-cover"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Quick facts */}
              <h3 className="mt-14 mb-6 text-xl font-semibold text-gray-800 md:text-2xl">
                Quick Facts
              </h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <QuickFactsCard icon="👩‍🏫" metric="Caregiver Ratio" value={selected.ratio} />
                <QuickFactsCard icon="👥" metric="Class Size" value={selected.classSize} />
                <QuickFactsCard icon="⏰" metric="Focus Hours" value={selected.focusHours} />
                <QuickFactsCard icon="🎨" metric="Enrichment" value={selected.enrichment} />
              </div>

              {/* Previous / next navigation */}
              <nav
                aria-label="Age group navigation"
                className="mt-12 flex flex-col justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row"
              >
                {previousGroup ? (
                  <Button variant="secondary" size="md" onClick={goToPrevious}>
                    ← {previousGroup.name}
                  </Button>
                ) : (
                  <span aria-hidden="true" />
                )}

                {nextGroup && (
                  <Button variant="secondary" size="md" onClick={goToNext}>
                    {nextGroup.name} →
                  </Button>
                )}
              </nav>
            </div>
          </section>
        )}

        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageFeatureImages images={pageImages} className="bg-white py-16 md:py-24" />

        <PageSections pageSlug="age-groups" />

      </main>

      <Footer />

      <Modal
        isOpen={lightbox !== null}
        onClose={() => setLightbox(null)}
        size="lg"
        ariaLabel={lightbox?.alt_text || 'Enlarged photograph'}
      >
        {lightbox && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.alt_text || ''}
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />
            {lightbox.alt_text && (
              <p className="mt-3 text-center text-sm text-gray-600">{lightbox.alt_text}</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
