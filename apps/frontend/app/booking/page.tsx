'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { BenefitCard } from '@/components/BenefitCard';
import { TourBookingForm } from '@/components/TourBookingForm';
import { Butterfly, Flower } from '@/components/Decorations';
import { usePhone, telHref } from '@/lib/footer';
import { WhatsAppCTA } from '@/components/WhatsAppCTA';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

interface TourFact {
  icon: string;
  label: string;
  value: string;
  description: string;
}

const TOUR_FACTS: readonly TourFact[] = [
  {
    icon: '⏱️',
    label: 'Duration',
    value: '45 minutes',
    description: 'Long enough to see every room without rushing your morning.',
  },
  {
    icon: '👥',
    label: 'Group Size',
    value: '2-4 people',
    description: 'Small groups, so there is time for your own questions.',
  },
  {
    icon: '🗣️',
    label: 'Languages',
    value: 'English & Arabic',
    description: 'Tell us which you prefer and we will match you with a guide.',
  },
  {
    icon: '📅',
    label: 'Availability',
    value: 'By appointment',
    description: 'Weekday slots from 9:00 AM, booked up to 30 days ahead.',
  },
];

/**
 * Each card links to the page that actually answers it. /contact-us does not
 * exist in this app — the contact route is /contact.
 */
const BENEFITS = [
  {
    icon: '🏢',
    title: 'See Our Facilities',
    description:
      'Modern classrooms, outdoor play areas, and specialized learning centers.',
    href: '/facilities',
  },
  {
    icon: '👨‍🏫',
    title: 'Meet Our Team',
    description:
      "Experienced educators dedicated to your child's growth and happiness.",
    href: '/nursery',
  },
  {
    icon: '📚',
    title: 'Learn About Programs',
    description:
      'Detailed information about our curriculum and approach to early learning.',
    href: '/age-groups',
  },
  {
    icon: '❓',
    title: 'Ask Questions',
    description:
      'Get answers to all your questions about enrollment, schedules, and costs.',
    href: '/contact',
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function BookingPage() {
  const phone = usePhone();
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('booking'));

  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* 1. Hero                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-62.5 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-500 to-amber-500 px-4 lg:min-h-100"
        >
          <Butterfly className="absolute left-[8%] top-[20%] w-14 text-white opacity-20 lg:w-20" />
          <Flower className="absolute right-[10%] bottom-[22%] w-12 text-white opacity-20 lg:w-20" />

          <div className="relative z-10 mx-auto max-w-3xl py-12 text-center">
            <EditableHeading
              sections={sections}
              sectionKey="booking-hero"
              id="hero-heading"
              className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
            >
              <h1
                id="hero-heading"
                className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
              >
                Schedule a Tour
              </h1>
            </EditableHeading>
            <p className="mt-4 text-lg text-blue-50 drop-shadow md:text-xl">
              See our facilities and meet our team
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Tour information                                              */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="tour-info-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            {/* A heading typed in the panel replaces this one. */}
            <EditableHeading
              sections={sections}
              sectionKey="intro"
              id="tour-info-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl"
            >
              <h2
                id="tour-info-heading"
                className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl"
              >
                Why Tour Little Smarties?
              </h2>
            </EditableHeading>
            {/* admin -> Pages -> Book a Tour -> Text. */}
            <div className="mx-auto mb-10 max-w-2xl text-center text-base text-gray-600 md:mb-12 md:text-lg">
              <EditableProse sections={sections} sectionKey="intro">
                <p>
                  A website can only show you so much. Come and see the rooms while the children are
                  in them, meet the people who would be caring for your child, and ask the questions
                  that matter to your family.
                </p>
              </EditableProse>
              <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
            </div>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10 lg:grid-cols-4">
              {TOUR_FACTS.map((fact) => (
                <article
                  key={fact.label}
                  className="flex h-full flex-col rounded-lg bg-white p-6 shadow-md transition-shadow duration-200 ease-in-out hover:shadow-lg"
                >
                  <span className="mb-3 text-4xl" aria-hidden="true">
                    {fact.icon}
                  </span>
                  <p className="text-sm text-gray-600">{fact.label}</p>
                  <p className="mb-2 text-2xl font-bold text-red-600">{fact.value}</p>
                  <p className="text-base text-gray-700">{fact.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3 & 4. Progress indicator and booking form                       */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="booking-heading" className="bg-white py-20 md:py-32">
          <div className="mx-auto max-w-4xl px-4 md:px-6">
            {/* sr-only and keeping its id: the section points at it with
                aria-labelledby. */}
            <EditableHeading
              sections={sections}
              sectionKey="booking-form-heading"
              id="booking-heading"
              className="sr-only"
            >
              <h2 id="booking-heading" className="sr-only">
                Tour booking form
              </h2>
            </EditableHeading>

            {/* Bordered because the section behind it is also white */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-md md:p-8">
              <TourBookingForm />
            </div>

            <WhatsAppCTA
              className="mt-8 flex flex-col items-center"
              message="Hello! I'd like to book a tour of Little Smarties."
              label="Book over WhatsApp"
              hint="Tell us a day that suits and we will confirm a slot."
            />

            <p className="mt-6 text-center text-sm text-gray-600">
              Prefer to arrange it over the phone?{' '}
              <a
                href={telHref(phone)}
                className="font-semibold text-red-600 underline transition-colors hover:text-red-700"
              >
                Call us on {phone}
              </a>
              .
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Benefits                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="benefits-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-5xl px-4 md:px-6 lg:px-8">
            <EditableHeading
              sections={sections}
              sectionKey="booking-benefits"
              id="benefits-heading"
              className="mb-10 text-center text-2xl font-bold text-gray-800 md:mb-12 md:text-3xl lg:text-4xl"
            >
              <h2
                id="benefits-heading"
                className="mb-10 text-center text-2xl font-bold text-gray-800 md:mb-12 md:text-3xl lg:text-4xl"
              >
                Why Parents Love Little Smarties
              </h2>
            </EditableHeading>

            <div className="grid grid-cols-1 gap-8 md:gap-10 lg:grid-cols-2">
              {BENEFITS.map((benefit) => (
                <BenefitCard
                  key={benefit.title}
                  icon={benefit.icon}
                  title={benefit.title}
                  description={benefit.description}
                  href={benefit.href}
                />
              ))}
            </div>
          </div>
        </section>
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageSections pageSlug="booking" />

      </main>

      <Footer />
    </>
  );
}
