'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { RegistrationForm } from '@/components/RegistrationForm';
import { Butterfly, Cloud } from '@/components/Decorations';
import { usePhone, telHref } from '@/lib/footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';

export default function RegisterPage() {
  const phone = usePhone();
  // Text written in admin -> Pages -> Register -> Text, keyed by section.
  // Migration 048 adds the pages row these sections attach to.
  const sections = sectionMap(usePageSections('register'));
  return (
    <>
      <Header />

      <main className="bg-white">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative flex min-h-62.5 items-center justify-center overflow-hidden bg-gradient-to-br from-blue-800 to-red-600 px-4 lg:min-h-100"
        >
          <Butterfly className="absolute left-[8%] top-[20%] w-14 text-white opacity-20 lg:w-20" />
          <Cloud className="absolute right-[9%] bottom-[20%] w-24 text-white opacity-20 lg:w-36" />

          <div className="relative z-10 mx-auto max-w-3xl py-12 text-center">
            <EditableHeading
              sections={sections}
              sectionKey="hero"
              id="hero-heading"
              className="text-3xl font-bold text-white drop-shadow-md md:text-4xl lg:text-5xl"
            >
              Enroll Your Child
            </EditableHeading>
            <p className="mt-4 text-lg text-blue-50 drop-shadow md:text-xl">
              <EditableProse sections={sections} sectionKey="hero">
                Start their learning journey with us
              </EditableProse>
            </p>
          </div>
        </section>

        {/* admin -> Pages -> Register -> Text. Renders nothing until a section
            is published, so the page is unchanged by default. */}
        <section className="mx-auto max-w-3xl px-4 pt-12 empty:hidden md:px-6">
          <EditableHeading sections={sections} sectionKey="intro" className="mb-3 text-2xl font-bold text-gray-800 md:text-3xl">{null}</EditableHeading>
          <EditableProse sections={sections} sectionKey="intro">{null}</EditableProse>
          <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Multi-step registration form                                     */}
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="form-heading" className="bg-gray-100 py-20 md:py-32">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2 id="form-heading" className="sr-only">
              Registration form
            </h2>

            <div className="rounded-lg bg-white p-6 shadow-md md:p-8">
              <RegistrationForm />
            </div>

            <p className="mt-6 text-center text-sm text-gray-600">
              Prefer to talk it through first?{' '}
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

        {/* Any further sections added in admin, after the form. */}
        <PageSections pageSlug="register" />
      </main>

      <Footer />
    </>
  );
}
