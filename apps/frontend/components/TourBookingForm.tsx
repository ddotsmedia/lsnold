'use client';

import React, { useEffect, useId, useState } from 'react';
import { Button } from './Button';
import { FormField, LABEL_CLASSES, type SelectOption } from './FormField';
import { FormStep } from './FormStep';
import { ProgressIndicator } from './ProgressIndicator';
import { DatePicker, formatIsoDate } from './DatePicker';
import { TimeSlotPicker, formatSlotLabel, type TimeSlot } from './TimeSlotPicker';
import { usePhone } from '../lib/footer';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface VisitorInfo {
  name: string;
  email: string;
  phone: string;
  numberOfVisitors: string;
  childrenAges: string;
  language: 'english' | 'arabic';
}

export interface BookingPreferences {
  specialRequests: string;
  heardAboutUs: string;
  ageGroupsInterest: string[];
  receiveUpdates: boolean;
}

export interface TourBookingFormProps {
  onSuccess?: () => void;
  className?: string;
}

type FieldErrors = Record<string, string>;

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = ['Date & Time', 'Your Info', 'Preferences', 'Confirm'] as const;
const TOTAL_STEPS = STEP_LABELS.length;

const VISITOR_COUNT_OPTIONS: readonly SelectOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

const HEARD_ABOUT_OPTIONS: readonly SelectOption[] = [
  { value: 'Google Search', label: 'Google Search' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Word of Mouth', label: 'Word of Mouth' },
  { value: 'Nursery Website', label: 'Nursery Website' },
  { value: 'Other', label: 'Other' },
];

const AGE_GROUP_INTERESTS = [
  'Bouncing Bunnies (0-1)',
  'Precious Pandas (1-2)',
  'Gentle Giraffes (2-3)',
  'Dazzling Dolphins (3-4)',
  'Fuzzy Foxes (4-5)',
  'All programs',
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'arabic', label: 'Arabic' },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The API requires at least 10 characters, so reject shorter here too. */
const MIN_PHONE_LENGTH = 10;

const EMPTY_VISITOR: VisitorInfo = {
  name: '',
  email: '',
  phone: '',
  numberOfVisitors: '1',
  childrenAges: '',
  language: 'english',
};

const EMPTY_PREFERENCES: BookingPreferences = {
  specialRequests: '',
  heardAboutUs: '',
  ageGroupsInterest: [],
  receiveUpdates: true,
};

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/* Local controls                                                              */
/* -------------------------------------------------------------------------- */

function RadioGroup({
  legend,
  name,
  options,
  value,
  onChange,
  required,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="mb-6 md:mb-8">
      <legend className={LABEL_CLASSES}>
        {legend} {required && <span className="text-red-600">*</span>}
      </legend>
      <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 transition-colors duration-200 hover:border-gray-300 has-checked:border-red-600 has-checked:bg-red-50"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-5 w-5 shrink-0 text-red-600 focus:ring-2 focus:ring-red-600"
            />
            <span className="py-2 text-base text-gray-800">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm font-semibold text-gray-600 sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="text-base text-gray-800">{value || '—'}</dd>
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 text-sm font-semibold text-red-600 underline transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
    >
      Edit
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                        */
/* -------------------------------------------------------------------------- */

export function TourBookingForm({ onSuccess, className }: TourBookingFormProps) {
  const phone = usePhone();
  const termsId = useId();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(null);
  const [visitor, setVisitor] = useState<VisitorInfo>(EMPTY_VISITOR);
  const [preferences, setPreferences] = useState<BookingPreferences>(EMPTY_PREFERENCES);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    reference: string;
    date: string;
    time: string;
    email: string;
  } | null>(null);
  // "Today" is resolved after mount so the calendar renders identically on the
  // server and on hydration.
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);

  const updateVisitor = <K extends keyof VisitorInfo>(key: K, value: VisitorInfo[K]): void =>
    setVisitor((current) => ({ ...current, [key]: value }));

  const updatePreferences = <K extends keyof BookingPreferences>(
    key: K,
    value: BookingPreferences[K],
  ): void => setPreferences((current) => ({ ...current, [key]: value }));

  function validateStep(step: number): FieldErrors {
    const found: FieldErrors = {};

    if (step === 1) {
      if (!selectedDate) found.date = 'Please choose a date for your tour.';
      if (!selectedTime) found.time = 'Please choose a time slot.';
    }

    if (step === 2) {
      if (visitor.name.trim().length < 2) found.name = 'Please enter your full name.';
      if (!visitor.email.trim()) {
        found.email = 'Please enter your email address.';
      } else if (!EMAIL_PATTERN.test(visitor.email.trim())) {
        found.email = 'Please enter a valid email address.';
      }
      if (!visitor.phone.trim()) {
        found.phone = 'Please enter a phone number.';
      } else if (visitor.phone.trim().length < MIN_PHONE_LENGTH) {
        found.phone = 'Please enter a full phone number, including the country code.';
      }
      if (!visitor.numberOfVisitors) found.numberOfVisitors = 'Please choose how many are coming.';
    }

    if (step === 3) {
      if (!preferences.heardAboutUs) found.heardAboutUs = 'Please let us know how you found us.';
    }

    if (step === 4) {
      if (!agreedToTerms) found.agreedToTerms = 'Please accept the booking terms to continue.';
    }

    return found;
  }

  const currentErrors = validateStep(currentStep);
  const isStepValid = Object.keys(currentErrors).length === 0;
  const errorFor = (key: string): string | undefined =>
    showErrors ? currentErrors[key] : undefined;

  const goToStep = (step: number): void => {
    setShowErrors(false);
    setCurrentStep(step);
  };

  const handleNext = (): void => {
    if (!isStepValid) {
      setShowErrors(true);
      return;
    }
    goToStep(Math.min(currentStep + 1, TOTAL_STEPS));
  };

  const handlePrevious = (): void => goToStep(Math.max(currentStep - 1, 1));

  /**
   * Books the tour through the existing API, which performs a conditional
   * insert so a slot cannot be claimed twice. A 409 means someone else took
   * the slot while this form was being filled in.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (currentStep !== TOTAL_STEPS || isSubmitting) return;

    for (let step = 1; step <= TOTAL_STEPS; step += 1) {
      const stepErrors = validateStep(step);
      if (Object.keys(stepErrors).length > 0) {
        setShowErrors(true);
        setCurrentStep(step);
        return;
      }
    }
    if (!selectedDate || !selectedTime) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tour-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_name: visitor.name.trim(),
          email: visitor.email.trim(),
          phone: visitor.phone.trim(),
          // The API validates this as an ISO 8601 datetime.
          preferred_date: `${formatIsoDate(selectedDate)}T${selectedTime}:00.000Z`,
          time_slot: selectedTime,
        }),
      });

      if (response.status === 409) {
        setSubmitError(
          'That time slot has just been taken. Please go back and choose another time.',
        );
        return;
      }
      if (!response.ok) throw new Error('Booking failed');

      const created: unknown = await response.json();
      const id =
        typeof created === 'object' && created !== null && 'id' in created
          ? String((created as { id: unknown }).id)
          : '';

      setConfirmed({
        reference: id ? `TOUR-${id.slice(0, 8).toUpperCase()}` : 'TOUR-PENDING',
        date: formatLongDate(selectedDate),
        time: formatSlotLabel(selectedTime),
        email: visitor.email.trim(),
      });
      setVisitor(EMPTY_VISITOR);
      setPreferences(EMPTY_PREFERENCES);
      setAgreedToTerms(false);
      onSuccess?.();
    } catch {
      setSubmitError(
        `We could not confirm your booking just now. Please try again, or call us on ${phone}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Success                                                                 */
  /* ---------------------------------------------------------------------- */

  if (confirmed) {
    return (
      <div
        role="status"
        className={cx(
          'rounded-lg border-2 border-green-400 bg-green-50 p-6 text-center md:p-8',
          className,
        )}
      >
        <h2 className="text-2xl font-bold text-green-800 md:text-3xl lg:text-4xl">
          Tour Booked Successfully!
        </h2>
        <p className="mt-4 text-base text-gray-700">
          Thank you! Your tour has been confirmed.
        </p>

        <dl className="mx-auto mt-6 max-w-md rounded-lg border border-green-300 bg-white p-4 text-left">
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-sm font-semibold text-gray-600">Confirmation</dt>
            <dd className="font-mono text-base font-bold text-green-800">{confirmed.reference}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-sm font-semibold text-gray-600">Date</dt>
            <dd className="text-base text-gray-800">{confirmed.date}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-sm font-semibold text-gray-600">Time</dt>
            <dd className="text-base text-gray-800">{confirmed.time}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-sm font-semibold text-gray-600">Location</dt>
            <dd className="text-right text-base text-gray-800">
              Little Smarties Nursery, Khalifa City (A), Abu Dhabi
            </dd>
          </div>
        </dl>

        <ul className="mx-auto mt-6 max-w-md list-disc space-y-2 pl-6 text-left text-base text-gray-700">
          <li>We&rsquo;ll send a confirmation email to {confirmed.email}.</li>
          <li>Please arrive 10 minutes early.</li>
          <li>If you need to reschedule, contact us at {phone}.</li>
        </ul>

        <div className="mt-8">
          <Button href="/" variant="primary" size="lg">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Form                                                                    */
  /* ---------------------------------------------------------------------- */

  return (
    <div className={className}>
      <ProgressIndicator
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS}
        className="mb-8 md:mb-12"
      />

      <form onSubmit={handleSubmit} noValidate>
        {/* ---------------------------- Step 1 ---------------------------- */}
        <FormStep
          stepNumber={1}
          currentStep={currentStep}
          title="Choose Your Tour Date & Time"
          subtitle="Select from available slots in the next 30 days"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              {today ? (
                <DatePicker
                  selectedDate={selectedDate}
                  today={today}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    // Availability differs per day, so a held time is no longer
                    // guaranteed once the date changes.
                    setSelectedTime(null);
                  }}
                />
              ) : (
                <p className="text-base text-gray-500">Loading calendar…</p>
              )}
              {errorFor('date') && <p className="mt-2 text-xs text-red-600">{errorFor('date')}</p>}
            </div>

            <div>
              <h3 className="mb-3 text-lg font-semibold text-gray-800">Available Times</h3>
              {selectedDate ? (
                <TimeSlotPicker
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  onSelectTime={(slot) => setSelectedTime(slot)}
                />
              ) : (
                <p className="text-base text-gray-600">Choose a date to see available times.</p>
              )}
              {errorFor('time') && <p className="mt-2 text-xs text-red-600">{errorFor('time')}</p>}
            </div>
          </div>

          {(selectedDate || selectedTime) && (
            <dl className="mt-8 rounded-lg bg-gray-50 p-4">
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-sm font-semibold text-gray-600">Selected date</dt>
                <dd className="text-lg font-bold text-gray-800">
                  {selectedDate ? formatLongDate(selectedDate) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-sm font-semibold text-gray-600">Selected time</dt>
                <dd className="text-lg font-bold text-gray-800">
                  {selectedTime ? formatSlotLabel(selectedTime) : '—'}
                </dd>
              </div>
            </dl>
          )}
        </FormStep>

        {/* ---------------------------- Step 2 ---------------------------- */}
        <FormStep
          stepNumber={2}
          currentStep={currentStep}
          title="Your Information"
          subtitle="So we can confirm your booking"
        >
          <FormField
            label="Your Full Name"
            type="text"
            name="name"
            value={visitor.name}
            onChange={(value) => updateVisitor('name', value)}
            error={errorFor('name')}
            autoComplete="name"
            required
          />
          <FormField
            label="Email Address"
            type="email"
            name="email"
            value={visitor.email}
            onChange={(value) => updateVisitor('email', value)}
            error={errorFor('email')}
            autoComplete="email"
            hint="Your confirmation will be sent here."
            required
          />
          <FormField
            label="Phone Number"
            type="tel"
            name="phone"
            value={visitor.phone}
            onChange={(value) => updateVisitor('phone', value)}
            error={errorFor('phone')}
            autoComplete="tel"
            placeholder="+971 50 123 4567"
            required
          />
          <FormField
            label="Number of Visitors"
            type="select"
            name="numberOfVisitors"
            value={visitor.numberOfVisitors}
            onChange={(value) => updateVisitor('numberOfVisitors', value)}
            error={errorFor('numberOfVisitors')}
            options={VISITOR_COUNT_OPTIONS}
            required
          />
          <FormField
            label="Children's Ages"
            type="text"
            name="childrenAges"
            value={visitor.childrenAges}
            onChange={(value) => updateVisitor('childrenAges', value)}
            placeholder="e.g., 2 years old, 1 year old"
          />

          <RadioGroup
            legend="Preferred Language"
            name="language"
            options={LANGUAGE_OPTIONS}
            value={visitor.language}
            onChange={(value) => updateVisitor('language', value as VisitorInfo['language'])}
            required
          />
        </FormStep>

        {/* ---------------------------- Step 3 ---------------------------- */}
        <FormStep
          stepNumber={3}
          currentStep={currentStep}
          title="Tour Preferences"
          subtitle="Tell us what interests you"
        >
          <FormField
            label="Special Requests"
            type="textarea"
            name="specialRequests"
            value={preferences.specialRequests}
            onChange={(value) => updatePreferences('specialRequests', value)}
            placeholder="Any specific facilities you'd like to see? Special circumstances we should know about?"
            rows={4}
          />

          <FormField
            label="How did you hear about us?"
            type="select"
            name="heardAboutUs"
            value={preferences.heardAboutUs}
            onChange={(value) => updatePreferences('heardAboutUs', value)}
            error={errorFor('heardAboutUs')}
            options={HEARD_ABOUT_OPTIONS}
            required
          />

          <fieldset className="mb-6 md:mb-8">
            <legend className={LABEL_CLASSES}>Which age group interests you?</legend>
            <div className="space-y-2">
              {AGE_GROUP_INTERESTS.map((option) => {
                const checked = preferences.ageGroupsInterest.includes(option);
                return (
                  <label key={option} className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        updatePreferences(
                          'ageGroupsInterest',
                          event.target.checked
                            ? [...preferences.ageGroupsInterest, option]
                            : preferences.ageGroupsInterest.filter((item) => item !== option),
                        )
                      }
                      className="h-5 w-5 shrink-0 rounded border-2 border-gray-300 text-red-600 focus:ring-2 focus:ring-red-600"
                    />
                    <span className="text-base text-gray-800">{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mb-6 flex items-start gap-3">
            <input
              type="checkbox"
              checked={preferences.receiveUpdates}
              onChange={(event) => updatePreferences('receiveUpdates', event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-gray-300 text-red-600 focus:ring-2 focus:ring-red-600"
            />
            <span className="text-sm text-gray-700">
              Send me updates about Little Smarties programs and events
            </span>
          </label>
        </FormStep>

        {/* ---------------------------- Step 4 ---------------------------- */}
        <FormStep
          stepNumber={4}
          currentStep={currentStep}
          title="Confirm Your Tour Booking"
          subtitle="Please review your booking details"
        >
          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Date &amp; Time</h3>
              <EditButton onClick={() => goToStep(1)} />
            </div>
            <p className="text-base font-semibold text-gray-800">
              {selectedDate ? formatLongDate(selectedDate) : '—'}
              {selectedTime ? ` at ${formatSlotLabel(selectedTime)}` : ''}
            </p>
          </section>

          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Your Information</h3>
              <EditButton onClick={() => goToStep(2)} />
            </div>
            <dl className="divide-y divide-gray-200">
              <ReviewRow label="Name" value={visitor.name} />
              <ReviewRow label="Email" value={visitor.email} />
              <ReviewRow label="Phone" value={visitor.phone} />
              <ReviewRow label="Number of Visitors" value={visitor.numberOfVisitors} />
              <ReviewRow label="Children's Ages" value={visitor.childrenAges} />
              <ReviewRow
                label="Preferred Language"
                value={visitor.language === 'arabic' ? 'Arabic' : 'English'}
              />
            </dl>
          </section>

          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Preferences</h3>
              <EditButton onClick={() => goToStep(3)} />
            </div>
            <dl className="divide-y divide-gray-200">
              <ReviewRow label="How you heard about us" value={preferences.heardAboutUs} />
              <ReviewRow
                label="Special Requests"
                value={preferences.specialRequests || 'None given'}
              />
              <ReviewRow
                label="Age Groups of Interest"
                value={preferences.ageGroupsInterest.join(', ') || 'Not specified'}
              />
              <ReviewRow
                label="Receive Updates"
                value={preferences.receiveUpdates ? 'Yes' : 'No'}
              />
            </dl>
          </section>

          <div className="mb-6 rounded-lg border-2 border-blue-400 bg-blue-50 p-6">
            <h3 className="mb-2 text-lg font-semibold text-blue-900">What to Expect</h3>
            <p className="text-base leading-relaxed text-gray-700">
              Your tour will include a walkthrough of all facilities, meeting with our team, Q&amp;A
              session about programs and enrollment, and light refreshments. Tour duration
              approximately 45 minutes.
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor={termsId} className="flex items-start gap-3">
              <input
                id={termsId}
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                aria-invalid={errorFor('agreedToTerms') ? true : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-gray-300 text-red-600 focus:ring-2 focus:ring-red-600"
              />
              <span className="text-sm text-gray-700">
                I agree to the tour booking terms and cancellation policy
              </span>
            </label>
            {errorFor('agreedToTerms') && (
              <p className="mt-1 text-xs text-red-600">{errorFor('agreedToTerms')}</p>
            )}
          </div>

          {submitError && (
            <p
              role="alert"
              className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            >
              {submitError}
            </p>
          )}
        </FormStep>

        {/* -------------------------- Navigation -------------------------- */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
          {currentStep > 1 ? (
            <Button variant="secondary" size="lg" onClick={handlePrevious}>
              Previous
            </Button>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}

          {/*
            Distinct keys stop React reusing one DOM node for both buttons.
            Without them the type flips from "button" to "submit" mid-click when
            the step advances, and the browser submits on that same click.
          */}
          {currentStep < TOTAL_STEPS ? (
            <Button
              key="next"
              variant="primary"
              size="lg"
              onClick={handleNext}
              disabled={!isStepValid}
            >
              Next
            </Button>
          ) : (
            <Button
              key="confirm"
              type="submit"
              variant="primary"
              size="lg"
              disabled={!agreedToTerms || isSubmitting}
            >
              {isSubmitting ? 'Confirming…' : 'Confirm Booking'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default TourBookingForm;
