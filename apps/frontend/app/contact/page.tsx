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
import { useFooter, lines } from '@/lib/footer';
import { useFaqs, type Faq } from '@/lib/faqs';
import { WhatsAppCTA } from '@/components/WhatsAppCTA';

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The phone, email, address and hours all come from admin -> Footer now.
 * They used to be a second copy here, which is how the page ended up
 * publishing a different email and a different address from the footer.
 */

/**
 * Splits one stored line of opening hours into the two columns the list
 * renders. "Mon – Fri: 7:00 – 18:00" becomes days and hours; a line with no
 * colon is shown whole, so an admin is not forced into the format.
 */
function splitHours(line: string): { days: string; hours: string } {
  const at = line.indexOf(':');
  if (at === -1) return { days: line, hours: '' };
  return { days: line.slice(0, at).trim(), hours: line.slice(at + 1).trim() };
}

/** What the page showed before the FAQs moved into the database. */
const FALLBACK_QA = [
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

// Shaped like a row so the hook can hand back either without the page caring.
const FALLBACK_FAQS: readonly Faq[] = FALLBACK_QA.map((entry) => ({
  id: `fallback-${entry.id}`,
  question: entry.question,
  answer: entry.answer,
  category: null,
  display_order: entry.id,
}));

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ContactPage() {
  // Hero image uploaded via admin → Media Library → Pages. Absent until one is
  // set, in which case the hero keeps its gradient.
  const pageImages = usePageMedia('contact');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('contact'));

  // Contact details come from admin -> Footer, the same row the site footer
  // reads, so the two can no longer disagree.
  const footer = useFooter();
  const emails = lines(footer.email);
  const address = lines(footer.address);
  const hours = lines(footer.hours);
  const mapQuery = encodeURIComponent(address.join(', '));

  const faqs = useFaqs(FALLBACK_FAQS);

  const contactCards = [
    emails.length > 0 && {
      type: 'email',
      icon: '✉️',
      title: 'Email',
      content: emails,
      linkText: 'Send Email',
      // The last address listed is the office one; the first is personal.
      linkHref: `mailto:${emails[emails.length - 1]}`,
    },
    footer.phone?.trim() && {
      type: 'phone',
      icon: '📱',
      title: 'Phone',
      content: [footer.phone],
      linkText: 'Call Us',
      linkHref: `tel:${footer.phone.replace(/\s/g, '')}`,
    },
    address.length > 0 && {
      type: 'address',
      icon: '📍',
      title: 'Address',
      content: address,
      linkText: 'Get Directions',
      linkHref: `https://maps.google.com/?q=${mapQuery}`,
    },
  ].filter(Boolean) as Array<{
    type: string;
    icon: string;
    title: string;
    content: readonly string[];
    linkText: string;
    linkHref: string;
  }>;

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
              {contactCards.map((info) => (
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

                {/* Under the form, separated by a rule: a second way to send
                    the same message, for anyone who would rather not wait on
                    an email reply. */}
                <div className="mt-6 border-t border-gray-100 pt-6">
                  <p className="mb-3 text-center text-sm text-gray-600">
                    Or message us directly
                  </p>
                  <WhatsAppCTA
                    block
                    message="Hello! I have a question about Little Smarties."
                    label="Chat on WhatsApp"
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-800 md:text-3xl">Our Location</h2>

                {/* Without an address the embed resolves to an arbitrary place,
                    so it is dropped rather than shown pointing somewhere wrong. */}
                {address.length > 0 && (
                  <div className="overflow-hidden rounded-lg shadow-md">
                    <iframe
                      title={`Map showing ${footer.company_name}`}
                      src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="aspect-3/2 w-full border-0"
                    />
                  </div>
                )}

                <address className="mt-6 rounded-lg bg-white p-6 not-italic shadow-md">
                  <p className="text-sm font-semibold text-gray-600">{footer.company_name}</p>
                  {address.map((line) => (
                    <p key={line} className="text-base text-gray-800 first:mt-2">
                      {line}
                    </p>
                  ))}
                  <a
                    href={`https://maps.google.com/?q=${mapQuery}`}
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
              {hours.map((line) => {
                const entry = splitHours(line);
                return (
                  <div
                    key={line}
                    className="flex items-baseline justify-between gap-4 px-6 py-4"
                  >
                    <dt className="text-base font-semibold text-gray-800">{entry.days}</dt>
                    <dd
                      className={
                        /closed/i.test(entry.hours)
                          ? 'text-base text-gray-500'
                          : 'text-base font-medium text-blue-800'
                      }
                    >
                      {entry.hours}
                    </dd>
                  </div>
                );
              })}
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

            <Accordion items={faqs} />
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
