'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageVideo } from '@/components/PageVideo';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { Button } from '@/components/Button';
import { FacilityCard } from '@/components/FacilityCard';
import { FacilityModal, type Facility } from '@/components/FacilityModal';
import { SafetyCard, type SafetyCardColor } from '@/components/SafetyCard';
import { Cloud, Flower } from '@/components/Decorations';
import { HeroBackground } from '@/components/HeroBackground';
import { PageFeatureImages } from '@/components/PageFeatureImages';
import { usePageMedia } from '@/lib/media';
import { useFeatureCards, cardsFor, cardColor } from '@/lib/featureCards';
import { cloudinaryResize, buildSrcSet, CARD_WIDTHS, WIDE_WIDTHS, CARD_SIZES } from '@/lib/cloudinary';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

/** A facility as the API returns it. */
interface ApiFacility {
  id: string;
  name: string;
  description: string | null;
  detailed_description: string | null;
  icon: string | null;
  features?: string[];
  amenities?: string[];
  images?: { url: string }[];
}

/**
 * The API's shape into the one the card and modal already take. Icons are
 * emoji in the seeded rows but the column also holds names like "classroom"
 * from the older records, so a non-emoji value falls back to a neutral glyph
 * rather than printing the word.
 */
function toFacility(row: ApiFacility, index: number): Facility {
  const icon = (row.icon ?? '').trim();
  const isEmoji = icon !== '' && !/^[a-z0-9 _-]+$/i.test(icon);
  return {
    id: index + 1,
    emoji: isEmoji ? icon : '🏫',
    name: row.name,
    description: row.description ?? '',
    features: row.features ?? [],
    detailedDescription: row.detailed_description ?? row.description ?? '',
    amenities: row.amenities ?? [],
    images: (row.images ?? []).map((i) => i.url),
  };
}

/**
 * Built-in copy, kept as the fallback for when the API is unreachable. The
 * live list comes from admin -> Facilities; this is what the page showed
 * before it became dynamic, and migration 019 seeded the database from it.
 */
const FALLBACK_FACILITIES: readonly Facility[] = [
  {
    id: 1,
    emoji: '🏫',
    name: 'Modern Classrooms',
    description: 'Bright, spacious classrooms designed for optimal learning and play',
    features: [
      'Climate-controlled environment',
      'Natural lighting',
      'Learning corners',
      'Age-appropriate furniture',
      'Interactive displays',
    ],
    detailedDescription:
      'Our classrooms are thoughtfully designed to support young learners. Each room is bright and airy with large windows for natural light. Furniture is appropriately sized for each age group, and learning corners encourage independent exploration throughout the day.',
    amenities: [
      'Individual cubbies for belongings',
      'Handwashing stations',
      'Floor mats for floor play',
      'Storage for materials',
      'Windows for outdoor views',
    ],
  },
  {
    id: 2,
    emoji: '🌳',
    name: 'Outdoor Play Area',
    description: 'Safe, engaging playground with age-appropriate equipment and nature areas',
    features: [
      'Safety-certified equipment',
      'Shaded areas',
      'Nature exploration zone',
      'Sand and water play',
      'Grass and soft surfaces',
    ],
    detailedDescription:
      'Our outdoor space is designed to encourage physical activity and nature exploration. With various play structures for different age groups, shaded areas for rest, and natural elements to investigate, children get the movement and fresh air they need every day.',
    amenities: [
      'Climbers and slides',
      'Swings',
      'Spring riders',
      'Sandbox',
      'Water play table',
      'Garden area',
    ],
  },
  {
    id: 3,
    emoji: '🎨',
    name: 'Art & Craft Studio',
    description: 'Creative space fully equipped with art supplies and inspiration',
    features: [
      'Easels and painting stations',
      'Sculpting materials',
      'Collage supplies',
      'Display wall for student work',
      'Water station for cleanup',
    ],
    detailedDescription:
      'This dedicated art studio is a haven for creative expression. With organized supply stations and a variety of mediums, children can explore their artistic talents freely, and finished work goes straight up on the display wall.',
    amenities: [
      'Paint, markers, colored pencils',
      'Clay and playdough',
      'Scissors and glue',
      'Paper in various colors',
      'Easels',
      'Display boards',
    ],
  },
  {
    id: 4,
    emoji: '🎵',
    name: 'Music Room',
    description: 'Dedicated space for musical exploration with instruments and audio equipment',
    features: [
      'Variety of instruments',
      'Sound system and speakers',
      'Dance floor',
      'Recording area',
      'Acoustic treatment',
    ],
    detailedDescription:
      'Our music room introduces children to the joy of sound and movement. With a carefully curated collection of instruments and equipment, children can explore rhythm, melody, and dance in a space built to take the noise.',
    amenities: [
      'Percussion instruments',
      'Xylophone',
      'Drums',
      'Piano keyboard',
      'Music CDs',
      'Microphone',
    ],
  },
  {
    id: 5,
    emoji: '📚',
    name: 'Library Corner',
    description: 'Cozy reading space with 1000+ books and comfortable seating',
    features: [
      'Diverse book collection',
      'Reading nooks',
      'Comfortable seating',
      'Quiet atmosphere',
      'Book rotation program',
    ],
    detailedDescription:
      'Our library is designed to foster a love of reading. With books in multiple languages and diverse stories, children can discover new worlds and expand their imagination, either alongside a teacher or curled up on their own.',
    amenities: [
      'Picture books',
      'Early readers',
      'Interactive books',
      'Cushioned seats',
      'Soft lighting',
      'Book displays',
    ],
  },
  {
    id: 6,
    emoji: '💻',
    name: 'Digital Lab',
    description: 'Modern technology space with tablets, interactive screens, and learning software',
    features: [
      'Interactive smart displays',
      'Educational tablets',
      'Learning software',
      'Video projection',
      'Age-appropriate content',
    ],
    detailedDescription:
      'Our digital lab introduces children to technology in a thoughtful, age-appropriate way. We use carefully selected educational software and interactive content to enhance learning, always in short sessions and alongside a teacher.',
    amenities: [
      'Tablets with educational apps',
      'Interactive whiteboard',
      'Laptop for teachers',
      'Projector and screen',
      'Headphones',
      'Charging station',
    ],
  },
  {
    id: 7,
    emoji: '🔬',
    name: 'Science Exploration Center',
    description: 'Hands-on space for scientific discovery and experimentation',
    features: [
      'Microscopes and observation tools',
      'Experiment kits',
      'Natural specimens',
      'Magnifying glasses',
      'Discovery shelves',
    ],
    detailedDescription:
      'This center sparks curiosity about the natural world. With accessible science equipment and carefully prepared materials, children can conduct their own experiments and investigations, and record what they notice.',
    amenities: [
      'Microscopes',
      'Magnifying glasses',
      'Specimen collection',
      'Experiment kits',
      'Containers for exploration',
      'Natural materials',
    ],
  },
  {
    id: 8,
    emoji: '🎭',
    name: 'Multi-Purpose Hall',
    description: 'Large space for assemblies, performances, events, and large group activities',
    features: [
      'Spacious layout',
      'Stage area',
      'Sound system',
      'Flexible seating',
      'Storage for props',
    ],
    detailedDescription:
      'Our multi-purpose hall is the heart of community activities. Used for assemblies, performances, celebrations, and group activities, it brings the entire school together in one room.',
    amenities: [
      'Stage',
      'Projector',
      'Sound system',
      'Mirrors',
      'Props storage',
      'Portable seating',
    ],
  },
  {
    id: 9,
    emoji: '🍽️',
    name: 'Cafeteria',
    description: 'Commercial kitchen and dining area with nutritionist-approved menus',
    features: [
      'Professional kitchen equipment',
      'High-chair seating',
      'Child-height tables',
      'Variety of nutritious meals',
      'Allergy management',
    ],
    detailedDescription:
      'Our cafeteria serves fresh, nutritious meals prepared by trained staff. Working with our nutritionist, we ensure all meals support healthy development and accommodate dietary needs and allergies.',
    amenities: [
      'Commercial kitchen',
      'Food service area',
      'Child-sized chairs and tables',
      'High chairs for infants',
      'Washing station',
      'Allergy-safe practices',
    ],
  },
];

interface SafetyFeature {
  icon: string;
  title: string;
  description: string;
  color: SafetyCardColor;
}

const SAFETY_FEATURES: readonly SafetyFeature[] = [
  {
    icon: '📹',
    title: '24/7 Monitoring',
    description:
      'Security cameras cover every entrance, corridor and play area, and access to the building is controlled throughout the day. Staff are trained on sign-in and collection procedures.',
    color: 'blue',
  },
  {
    icon: '🌬️',
    title: 'Air Purification',
    description:
      'HEPA filtration runs in every room to keep the air clean, and classrooms are ventilated regularly. Filters are checked and replaced on a fixed schedule.',
    color: 'green',
  },
  {
    icon: '🧹',
    title: 'Daily Sanitation',
    description:
      'Rooms, toys and shared surfaces are cleaned to a documented standard every day, with high-touch points wiped down repeatedly between activities.',
    color: 'red',
  },
  {
    icon: '🛡️',
    title: 'Safety Protocols',
    description:
      'Clear emergency procedures are posted and practised, staff hold current first-aid training, and allergy and medication plans are kept for every child who needs one.',
    color: 'yellow',
  },
];

const OUTDOOR_FEATURES: readonly string[] = [
  'Separate play zones for infants, toddlers and preschoolers',
  'Shade sails and covered areas for hot parts of the day',
  'Soft-fall surfacing beneath all climbing equipment',
  'A planting bed the children sow and tend themselves',
  'Sand and water play stations for messy exploration',
  'Open grass for running, ball games and group activities',
];

const TECHNOLOGY_FEATURES: readonly string[] = [
  'Interactive displays in classrooms',
  'Tablets for interactive learning',
  'Educational software platforms',
  'Digital observation and documentation',
];

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function FacilitiesPage() {
  // Slots set in admin → Pages → Facilities → Images. Absent until one is set,
  // in which case the hero keeps its gradient.
  const pageImages = usePageMedia('facilities');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('facilities'));
  // Safety cards written in admin -> Feature Cards. The built-in list stands
  // until the fetch lands, and again if it fails, so the section is never
  // empty and never flashes blank.
  const dbSafetyCards = cardsFor(useFeatureCards('facilities'), 'facilities-safety');
  const safetyCards =
    dbSafetyCards.length > 0
      ? dbSafetyCards.map((c) => ({
          key: c.id,
          icon: c.icon ?? '',
          title: c.title,
          description: c.description ?? '',
          color: cardColor(c.color),
        }))
      : SAFETY_FEATURES.map((f) => ({ key: f.title, ...f }));
  // Only the slots that have been filled, in order, so two images lay out as a
  // pair rather than leaving a gap where the third would be.
  const featureImages = ['feature_1', 'feature_2', 'feature_3']
    .map((slot) => pageImages[slot])
    .filter(Boolean);
  const [facilities, setFacilities] = useState<readonly Facility[]>(FALLBACK_FACILITIES);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  /**
   * Whether the fetch has finished, either way.
   *
   * Settled, not loaded. A flag set only on success would leave the modal
   * permanently unopenable whenever the request fails, the response is not an
   * array, or the table is empty — all three of which still render the
   * built-in cards, so the page would look fine and simply not respond to a
   * click. Failing to the built-in list is the intended behaviour here; being
   * unable to open it is not.
   */
  const [settled, setSettled] = useState(false);

  // Managed in admin -> Facilities. On any failure the built-in list stands, so
  // a backend problem never empties the page.
  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/facilities`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((rows: ApiFacility[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        setFacilities(rows.map(toFacility));
        // The list under any open selection has just been replaced, and the
        // index was chosen against the old one. Dropping it is better than
        // opening a different facility than the one that was clicked.
        setSelectedIndex(null);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, []);

  const closeModal = useCallback(() => setSelectedIndex(null), []);

  // Wrap around at both ends so navigation never dead-ends.
  const goToPrevious = useCallback(() => {
    setSelectedIndex((current) =>
      current === null ? null : (current - 1 + facilities.length) % facilities.length,
    );
  }, []);

  const goToNext = useCallback(() => {
    setSelectedIndex((current) =>
      current === null ? null : (current + 1) % facilities.length,
    );
  }, []);

  const selectedFacility = selectedIndex === null ? null : (facilities[selectedIndex] ?? null);

  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* 1. Hero                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-75 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-800 to-red-600 px-4 lg:min-h-125"
        >
          <HeroBackground image={pageImages.hero} />
          <Flower className="absolute left-[7%] top-[20%] w-14 text-white opacity-20 lg:w-24" />
          <Cloud className="absolute bottom-[14%] right-[8%] w-28 text-white opacity-20 lg:w-44" />
          <Cloud className="absolute left-[12%] bottom-[18%] w-20 text-white opacity-20 lg:w-32" />

          <div className="relative z-10 mx-auto max-w-3xl py-16 text-center">
            <EditableHeading
              sections={sections}
              sectionKey="facilities-hero"
              id="hero-heading"
              className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
            >
              <h1
                id="hero-heading"
                className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
              >
                Our State-of-the-Art Facilities
              </h1>
            </EditableHeading>
            <p className="mt-4 text-lg text-blue-50 drop-shadow md:text-xl">
              Where learning happens in a safe, nurturing environment
            </p>
          </div>
        </section>

        {/* Video assigned in admin -> Gallery -> Videos. Renders nothing when
            none is set for this page. */}
        <PageVideo pageSlug="facilities" heading="Take a look" />

        {/* ---------------------------------------------------------------- */}
        {/* 2. Intro                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="intro-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
            <EditableHeading
              sections={sections}
              sectionKey="facilities-intro-heading"
              id="intro-heading"
              className="mb-6 text-2xl font-bold text-gray-800 md:mb-8 md:text-3xl lg:text-4xl"
            >
              <h2
                id="intro-heading"
                className="mb-6 text-2xl font-bold text-gray-800 md:mb-8 md:text-3xl lg:text-4xl"
              >
                World-Class Learning Environments
              </h2>
            </EditableHeading>
            <div className="space-y-4 text-left text-base leading-relaxed text-gray-700 md:text-lg">
              <p>
                Every room at Little Smarties is built around what children of that age actually
                need. Ceilings are high, windows are large, and sightlines are kept open so a teacher
                can see the whole room at a glance without ever feeling like a supervisor.
              </p>
              <p>
                Safety is designed in rather than added on. Equipment meets recognised safety
                standards, surfaces are chosen for how they behave when a child falls on them, and
                the cleaning and ventilation routines run on a fixed schedule rather than by memory.
              </p>
              <p>
                Just as importantly, the spaces are set up so children can reach things themselves.
                Materials sit at child height, storage is labelled with pictures as well as words,
                and each room has a quiet corner for anyone who needs a moment away from the group.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2b. Feature photographs                                          */}
        {/*                                                                   */}
        {/* Set in admin -> Pages -> Facilities -> Images. The whole section  */}
        {/* is skipped while every slot is empty, so nothing reserves space   */}
        {/* on a page that has no photographs yet.                           */}
        {/* ---------------------------------------------------------------- */}
        {featureImages.length > 0 && (
          <section aria-label="Photographs of our facilities" className="bg-white pb-16 md:pb-24">
            <div className="mx-auto max-w-6xl px-4 md:px-6">
              <div
                className={`grid gap-6 ${
                  featureImages.length === 1
                    ? 'grid-cols-1'
                    : featureImages.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {featureImages.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={image.id}
                    src={cloudinaryResize(image.url, 500, 375)}
                    srcSet={buildSrcSet(image.url, CARD_WIDTHS, { ratio: 3 / 4 })}
                    sizes={CARD_SIZES}
                    alt={image.alt_text || ''}
                    loading="lazy"
                    className="aspect-4/3 w-full rounded-lg object-cover shadow-md"
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* 3. Facilities grid                                               */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="facilities-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            {/* A heading typed in the panel replaces this one. */}
            <EditableHeading
              sections={sections}
              sectionKey="intro"
              id="facilities-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="facilities-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                Explore Our Spaces
              </h2>
            </EditableHeading>
            {/* admin -> Pages -> Facilities -> Text. */}
            <div className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
              <EditableProse sections={sections} sectionKey="intro">
                <p>
                  Nine dedicated environments, each set up for a different kind of learning. Select
                  any one to see the full detail.
                </p>
              </EditableProse>
              <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
            </div>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10 lg:grid-cols-3">
              {facilities.map((facility, index) => (
                <FacilityCard
                  key={facility.id}
                  emoji={facility.emoji}
                  name={facility.name}
                  description={facility.description}
                  features={facility.features}
                  onClick={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Safety & hygiene                                              */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="safety-heading" className="bg-blue-50 py-20 md:py-32">
          <div className="mx-auto max-w-5xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="facilities-safety"
              id="safety-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              <h2
                id="safety-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
              >
                Safety &amp; Hygiene Standards
              </h2>
            </EditableHeading>
            <p className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
              The routines that run in the background every single day.
            </p>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
              {safetyCards.map((feature) => (
                <SafetyCard
                  key={feature.key}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  color={feature.color}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 6. Outdoor facilities                                            */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="outdoor-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 md:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
            {pageImages.feature_1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cloudinaryResize(pageImages.feature_1.url, 600, 400)}
                srcSet={buildSrcSet(pageImages.feature_1.url, CARD_WIDTHS, { naturalWidth: pageImages.feature_1.width, ratio: 2 / 3 })}
                sizes='(max-width: 1024px) calc(100vw - 32px), 576px'
                alt={pageImages.feature_1.alt_text || 'Outdoor play areas'}
                loading="lazy"
                className="aspect-3/2 w-full rounded-lg object-cover shadow-md"
              />
            ) : (
              <div
                className="aspect-3/2 w-full rounded-lg bg-gradient-to-br from-green-100 to-emerald-200"
                role="img"
                aria-label="Outdoor play areas"
              />
            )}

            <div>
              <EditableHeading
                sections={sections}
                sectionKey="facilities-outdoor"
                id="outdoor-heading"
                className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
              >
                <h2
                  id="outdoor-heading"
                  className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
                >
                  Outdoor Play Areas
                </h2>
              </EditableHeading>
              <div className="space-y-4 text-base leading-relaxed text-gray-700">
                <p>
                  Outdoor time is timetabled, not treated as a reward or an afterthought. Children
                  are outside every day, in weather that allows it, because gross-motor development
                  and open-ended play need more room than a classroom can offer.
                </p>
                <p>
                  The space is zoned by age so that infants exploring on their hands and knees are
                  not sharing ground with preschoolers at a run. Each zone has its own equipment,
                  scaled to the children using it.
                </p>
              </div>

              <ul className="mt-6 space-y-2">
                {OUTDOOR_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-base text-gray-700">
                    <span className="mt-0.5 text-green-600" aria-hidden="true">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Technology & learning                                         */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="technology-heading" className="bg-gray-50 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 md:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
            <div className="lg:order-2">
              {pageImages.feature_2 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cloudinaryResize(pageImages.feature_2.url, 600, 400)}
                  srcSet={buildSrcSet(pageImages.feature_2.url, CARD_WIDTHS, { naturalWidth: pageImages.feature_2.width, ratio: 2 / 3 })}
                  sizes='(max-width: 1024px) calc(100vw - 32px), 576px'
                  alt={pageImages.feature_2.alt_text || 'Technology-enhanced learning'}
                  loading="lazy"
                  className="aspect-3/2 w-full rounded-lg object-cover shadow-md"
                />
              ) : (
                <div
                  className="aspect-3/2 w-full rounded-lg bg-gradient-to-br from-blue-100 to-purple-100"
                  role="img"
                  aria-label="Technology-enhanced learning"
                />
              )}
            </div>

            <div className="lg:order-1">
              <EditableHeading
                sections={sections}
                sectionKey="facilities-technology"
                id="technology-heading"
                className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
              >
                <h2
                  id="technology-heading"
                  className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 md:text-3xl lg:text-4xl"
                >
                  Technology-Enhanced Learning
                </h2>
              </EditableHeading>
              <div className="space-y-4 text-base leading-relaxed text-gray-700">
                <p>
                  Screens are a tool here, not a babysitter. Technology appears in short, purposeful
                  sessions with a teacher alongside, and it is used when it does something a book or
                  a set of blocks genuinely cannot.
                </p>
                <p>
                  Behind the scenes it does more work than it does in front of the children: our
                  teachers use digital observation to record progress, capture moments from the day
                  and share them with families without losing teaching time to paperwork.
                </p>
              </div>

              <ul className="mt-6 space-y-2">
                {TECHNOLOGY_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-base text-gray-700">
                    <span className="mt-0.5 text-blue-500" aria-hidden="true">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 8. Call to action                                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="cta-heading"
          className="bg-gradient-to-r from-red-600 to-orange-500 py-16 md:py-20"
        >
          <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
            <EditableHeading
              sections={sections}
              sectionKey="facilities-cta"
              id="cta-heading"
              className="text-xl font-semibold text-white md:text-2xl"
            >
              <h2 id="cta-heading" className="text-xl font-semibold text-white md:text-2xl">
                Ready to see our facilities in person?
              </h2>
            </EditableHeading>
            <p className="mt-4 text-base text-orange-50 md:text-lg">
              Book a tour and we will walk you through every room while the children are in them.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Button href="/booking" variant="primary" size="lg">
                Schedule a Tour
              </Button>
              <Button href="/contact" variant="secondary" size="lg">
                Contact Us
              </Button>
            </div>
          </div>
        </section>
        {/* feature_1 and feature_2 sit in the sections above; this catches the
            third so no uploaded image is left with nowhere to appear. */}
        <PageFeatureImages
          images={pageImages}
          slots={['feature_3']}
          className="bg-white py-16 md:py-24"
        />

        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        {/* Keys this page renders itself; without them each is published twice. */}
        <PageSections
          pageSlug="facilities"
          consumedKeys={[
            'facilities-hero', 'facilities-intro-heading', 'facilities-outdoor',
            'facilities-safety', 'facilities-technology', 'facilities-cta',
          ]}
        />

      </main>

      <Footer />

      {/* ------------------------------------------------------------------ */}
      {/* 4. Facility details modal                                          */}
      {/* ------------------------------------------------------------------ */}
      <FacilityModal
        isOpen={selectedIndex !== null && settled}
        onClose={closeModal}
        facility={selectedFacility}
        onPrevious={goToPrevious}
        onNext={goToNext}
        currentIndex={selectedIndex === null ? undefined : selectedIndex + 1}
        total={facilities.length}
      />
    </>
  );
}
