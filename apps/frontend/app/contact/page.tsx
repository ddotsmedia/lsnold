'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { PageFeatureImages } from '@/components/PageFeatureImages';
import { Accordion, type AccordionEntry } from '@/components/Accordion';
import { ContactForm } from '@/components/ContactForm';
import { InfoCard } from '@/components/InfoCard';
import { Butterfly, Flower } from '@/components/Decorations';
import { HeroBackground } from '@/components/HeroBackground';
import { usePageMedia } from '@/lib/media';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

interface ContactInfo {
  type: string;
  icon: string;
  title: string;
  content: readonly string[];
  linkText?: string;
  linkHref?: string;
}

const CONTACT_INFO: readonly ContactInfo[] = [
  {
    type: 'email',
    icon: '✉️',
    title: 'Email',
    content: ['lsn@gmail.com', 'info@lsn.ae'],
    linkText: 'Send Email',
    linkHref: 'mailto:info@lsn.ae',
  },
  {
    type: 'phone',
    icon: '📱',
    title: 'Phone',
    content: ['+971 56 267 7747'],
    linkText: 'Call Us',
    linkHref: 'tel:+971562677747',
  },
  {
    type: 'address',
    icon: '📍',
    title: 'Address',
    content: ['Ministry of Justice Building', 'Khalifa City (A)', 'Abu Dhabi, UAE'],
    linkText: 'Get Directions',
    linkHref: 'https://maps.google.com/?q=Khalifa+City+A+Abu+Dhabi',
  },
];

interface OfficeHour {
  days: string;
  hours: string;
}

const OFFICE_HOURS: readonly OfficeHour[] = [
  { days: 'Monday – Friday', hours: '7:00 AM – 6:00 PM' },
  { days: 'Saturday', hours: 'Closed' },
  { days: 'Sunday', hours: 'Closed' },
  { days: 'Holidays', hours: 'Closed' },
];

const FAQS: readonly AccordionEntry[] = [
  {
    id: 1,
    question: 'How do I enroll my child at Little Smarties?',
    answer:
      "Enrollment is simple! Visit our website, fill out the registration form, or contact us directly. We'll schedule a tour and answer all your questions about our programs.",
  },
  {
    id: 2,
    question: "What's your cancellation or withdrawal policy?",
    answer:
      "We require 30 days notice for withdrawal. Tuition is prorated if you withdraw mid-month. Please contact our office for specific details about your child's enrollment.",
  },
  {
    id: 3,
    question: 'Do you accept part-time enrollment?',
    answer:
      'Yes! We offer flexible enrollment options including full-time, part-time (3 days/week), and flexible scheduling. Contact us to discuss what works best for your family.',
  },
  {
    id: 4,
    question: "What's included in tuition?",
    answer:
      'Tuition includes daily care, meals and snacks, educational activities, field trips, and special programs like music and art. Additional enrichment classes are available for an extra fee.',
  },
  {
    id: 5,
    question: 'How often will I get updates about my child?',
    answer:
      'We provide daily updates via email and photos. Parents can also access our online portal to see observations and developmental milestones. Parent meetings are held quarterly.',
  },
  {
    id: 6,
    question: 'What are your safety procedures?',
    answer:
      "We have comprehensive safety protocols including 24/7 monitoring, strict access control, emergency procedures, and trained staff. Your child's safety is our top priority.",
  },
  {
    id: 7,
    question: 'Do you provide transportation?',
    answer:
      "Currently, we do not provide transportation. However, we're located in a central area with easy access. Many families use ride-sharing services or arrange carpools.",
  },
  {
    id: 8,
    question: "What's your policy on sick children?",
    answer:
      'We ask parents to keep sick children home if they have fever, diarrhea, or other contagious symptoms. We follow health guidelines to protect all children in our care.',
  },
];

const MAP_QUERY = 'Khalifa+City+A+Abu+Dhabi';

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ContactPage() {
  // Hero image uploaded via admin → Media Library → Pages. Absent until one is
  // set, in which case the hero keeps its gradient.
  const pageImages = usePageMedia('contact');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('contact'));
  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* 1. Hero                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-62.5 items-center justify-center overflow-hidden bg-gradient-to-br from-red-600 to-amber-500 px-4 lg:min-h-100"
        >
          <HeroBackground image={pageImages.hero} />
          <Butterfly className="absolute left-[8%] top-[20%] w-14 text-white opacity-20 lg:w-20" />
          <Flower className="absolute right-[10%] bottom-[22%] w-12 text-white opacity-20 lg:w-20" />

          <div className="relative z-10 mx-auto max-w-3xl py-12 text-center">
            <h1
              id="hero-heading"
              className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
            >
              Get in Touch
            </h1>
            <p className="mt-4 text-lg text-orange-50 drop-shadow md:text-xl">
              We&rsquo;d love to hear from you
            </p>
          </div>
        </section>

        {/* admin -> Pages -> Contact -> Text. Renders nothing until a section
            is published, so the page is unchanged by default. */}
        <section className="mx-auto max-w-4xl px-4 pt-12 empty:hidden md:px-6">
          <EditableHeading sections={sections} sectionKey="intro" className="mb-3 text-2xl font-bold text-gray-800 md:text-3xl">{null}</EditableHeading>
          <EditableProse sections={sections} sectionKey="intro">{null}</EditableProse>
          <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Contact info cards                                            */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="info-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <h2 id="info-heading" className="sr-only">
              Contact details
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
              {CONTACT_INFO.map((info) => (
                <InfoCard
                  key={info.type}
                  icon={info.icon}
                  title={info.title}
                  content={info.content}
                  linkText={info.linkText}
                  linkHref={info.linkHref}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3 & 4. Form and location                                         */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="form-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
            <h2 id="form-heading" className="sr-only">
              Send a message and find us
            </h2>

            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
              <div className="rounded-lg bg-white p-6 shadow-md md:p-8">
                <ContactForm />
              </div>

              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-800 md:text-3xl">Our Location</h2>

                <div className="overflow-hidden rounded-lg shadow-md">
                  <iframe
                    title="Map showing Little Smarties Nursery in Khalifa City, Abu Dhabi"
                    src={`https://maps.google.com/maps?q=${MAP_QUERY}&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="aspect-3/2 w-full border-0"
                  />
                </div>

                <address className="mt-6 rounded-lg bg-white p-6 not-italic shadow-md">
                  <p className="text-sm font-semibold text-gray-600">Little Smarties Nursery</p>
                  <p className="mt-2 text-base text-gray-800">Ministry of Justice Building</p>
                  <p className="text-base text-gray-800">Khalifa City (A)</p>
                  <p className="text-base text-gray-800">Abu Dhabi, UAE</p>
                  <a
                    href={`https://maps.google.com/?q=${MAP_QUERY}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-red-600 transition-colors duration-200 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    Get Directions
                    <span aria-hidden="true"> →</span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </address>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Office hours                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="hours-heading" className="bg-blue-50 py-16 md:py-24">
          <div className="mx-auto max-w-xl px-4 md:px-6">
            <h2
              id="hours-heading"
              className="mb-8 text-center text-2xl font-bold text-gray-800 md:text-3xl"
            >
              Office Hours
            </h2>

            <dl className="divide-y divide-blue-100 overflow-hidden rounded-lg bg-white shadow-md">
              {OFFICE_HOURS.map((entry) => (
                <div
                  key={entry.days}
                  className="flex items-baseline justify-between gap-4 px-6 py-4"
                >
                  <dt className="text-base font-semibold text-gray-800">{entry.days}</dt>
                  <dd
                    className={
                      entry.hours === 'Closed'
                        ? 'text-base text-gray-500'
                        : 'text-base font-medium text-blue-800'
                    }
                  >
                    {entry.hours}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-6 text-center text-sm text-gray-600">
              Extended hours available upon request
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 6. FAQ                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="faq-heading" className="bg-white py-20 md:py-32">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2
              id="faq-heading"
              className="mb-4 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
            >
              Frequently Asked Questions
            </h2>
            <p className="mb-10 text-center text-base text-gray-600 md:mb-12 md:text-lg">
              Can&rsquo;t find what you need? Send us a message above and we will answer directly.
            </p>

            <Accordion items={FAQS} />
          </div>
        </section>
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageFeatureImages images={pageImages} className="bg-white py-16 md:py-24" />

        <PageSections pageSlug="contact" />

      </main>

      <Footer />
    </>
  );
}
