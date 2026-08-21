'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Button } from './Button';
import { FormField, LABEL_CLASSES, type SelectOption } from './FormField';
import { FormStep } from './FormStep';
import { ProgressIndicator } from './ProgressIndicator';
import { usePhone, telHref } from '../lib/footer';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ChildInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | '';
  ageGroupId: string;
  hasSpecialNeeds: boolean;
  dietaryRestrictions: string;
}

export interface ParentInfo {
  fullName: string;
  email: string;
  phoneNumber: string;
  secondaryPhone: string;
  address: string;
  city: string;
  relationship: string;
}

export interface PreferencesInfo {
  programType: 'full-time' | 'part-time' | 'flexible' | '';
  startDate: string;
  additionalRequests: string;
  communicationPreference: string[];
  agreedToTerms: boolean;
}

export interface RegistrationData {
  childInfo: ChildInfo;
  parentInfo: ParentInfo;
  preferences: PreferencesInfo;
}

export interface RegistrationFormProps {
  onSuccess?: () => void;
  className?: string;
}

type FieldErrors = Record<string, string>;

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const STEP_LABELS = ['Child Info', 'Parent Info', 'Preferences', 'Review'] as const;
const TOTAL_STEPS = STEP_LABELS.length;

/** A programme as /api/v1/age-groups returns it. */
interface ApiAgeGroup {
  id: string;
  name: string;
  min_age_months: number;
  max_age_months: number;
}

/**
 * Turns 0-12 months into "0 - 1 year", which is how the site talks about the
 * programmes everywhere else. Whole years where they divide evenly, months
 * otherwise.
 */
function ageRangeLabel(minMonths: number, maxMonths: number): string {
  const asYears = (months: number) => months / 12;
  if (minMonths % 12 === 0 && maxMonths % 12 === 0) {
    const from = asYears(minMonths);
    const to = asYears(maxMonths);
    return `${from} - ${to} year${to === 1 ? '' : 's'}`;
  }
  return `${minMonths} - ${maxMonths} months`;
}

const RELATIONSHIP_OPTIONS: readonly SelectOption[] = [
  { value: 'Mother', label: 'Mother' },
  { value: 'Father', label: 'Father' },
  { value: 'Guardian', label: 'Guardian' },
  { value: 'Other', label: 'Other' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

const PROGRAM_OPTIONS = [
  { value: 'full-time', label: 'Full-Time (5 days/week, 7 AM - 6 PM)' },
  { value: 'part-time', label: 'Part-Time (3 days/week, 7 AM - 6 PM)' },
  { value: 'flexible', label: 'Flexible (Custom hours)' },
] as const;

const COMMUNICATION_OPTIONS = ['Email', 'Phone', 'WhatsApp'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits, spaces and the usual separators; at least 7 digits overall. */
const PHONE_PATTERN = /^[+()\-\s\d]{7,}$/;

const EMPTY_DATA: RegistrationData = {
  childInfo: {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    ageGroupId: '',
    hasSpecialNeeds: false,
    dietaryRestrictions: '',
  },
  parentInfo: {
    fullName: '',
    email: '',
    phoneNumber: '',
    secondaryPhone: '',
    address: '',
    city: '',
    relationship: '',
  },
  preferences: {
    programType: '',
    startDate: '',
    additionalRequests: '',
    communicationPreference: [],
    agreedToTerms: false,
  },
};

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const monthDelta = to.getMonth() - from.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && to.getDate() < from.getDate())) years -= 1;
  return years;
}

function nextMonday(from: Date): Date {
  const result = new Date(from);
  const daysUntilMonday = ((8 - result.getDay()) % 7) || 7;
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

function labelFor(options: readonly SelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Everything the form asks for that has no column of its own, gathered into the
 * message field. Without this the gender, dietary needs, preferred start date
 * and programme choice were collected from the family and then thrown away.
 */
function buildRegistrationNotes(data: RegistrationData): string {
  const { childInfo, parentInfo, preferences } = data;
  const lines: string[] = [];

  if (childInfo.gender) lines.push(`Gender: ${childInfo.gender}`);
  if (childInfo.hasSpecialNeeds) lines.push('Has special needs: yes');
  if (childInfo.dietaryRestrictions.trim()) {
    lines.push(`Dietary needs: ${childInfo.dietaryRestrictions.trim()}`);
  }
  if (parentInfo.relationship) lines.push(`Relationship: ${parentInfo.relationship}`);
  if (parentInfo.secondaryPhone.trim()) lines.push(`Second phone: ${parentInfo.secondaryPhone.trim()}`);
  const address = [parentInfo.address.trim(), parentInfo.city.trim()].filter(Boolean).join(', ');
  if (address) lines.push(`Address: ${address}`);
  if (preferences.programType) lines.push(`Programme: ${preferences.programType}`);
  if (preferences.startDate) lines.push(`Preferred start: ${preferences.startDate}`);
  if (preferences.communicationPreference.length > 0) {
    lines.push(`Contact by: ${preferences.communicationPreference.join(', ')}`);
  }
  if (preferences.additionalRequests.trim()) {
    lines.push(`Notes: ${preferences.additionalRequests.trim()}`);
  }

  return lines.join('\n');
}

function formatDisplayDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* -------------------------------------------------------------------------- */
/* Small local controls                                                        */
/* -------------------------------------------------------------------------- */

interface RadioGroupProps {
  legend: string;
  name: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

function RadioGroup({ legend, name, options, value, onChange, error, required }: RadioGroupProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;

  return (
    <fieldset className="mb-6 md:mb-8">
      <legend className={LABEL_CLASSES}>
        {legend} {required && <span className="text-red-600">*</span>}
      </legend>
      <div
        className="space-y-2"
        role="radiogroup"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 transition-colors duration-200 hover:border-gray-300 has-checked:border-red-600 has-checked:bg-red-50"
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
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface CheckboxProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

function Checkbox({ label, checked, onChange, error }: CheckboxProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="mb-6">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-gray-300 text-red-600 focus:ring-2 focus:ring-red-600"
        />
        <span className="text-sm text-gray-700">{label}</span>
      </label>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only row used by the review step. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4">
      <dt className="text-sm font-semibold text-gray-600 sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="text-base text-gray-800">{value || '—'}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                        */
/* -------------------------------------------------------------------------- */

export function RegistrationForm({ onSuccess, className }: RegistrationFormProps) {
  const phone = usePhone();
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<RegistrationData>(EMPTY_DATA);
  const [errors, setErrors] = useState<FieldErrors>({});

  /**
   * The programmes come from the API so their ids are the real ones the
   * registrations foreign key expects. They used to be hardcoded as '1'-'4',
   * which matched no row, and the 0-1 year programme was missing entirely.
   */
  const [ageGroups, setAgeGroups] = useState<ApiAgeGroup[]>([]);
  const [ageGroupsFailed, setAgeGroupsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/age-groups`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((rows: ApiAgeGroup[]) => {
        if (cancelled) return;
        if (!Array.isArray(rows) || rows.length === 0) { setAgeGroupsFailed(true); return; }
        // Youngest first, so the list reads in the order a family expects.
        setAgeGroups([...rows].sort((a, b) => a.min_age_months - b.min_age_months));
      })
      .catch(() => { if (!cancelled) setAgeGroupsFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const ageGroupOptions: readonly SelectOption[] = ageGroups.map((group) => ({
    value: group.id,
    label: `${group.name} (${ageRangeLabel(group.min_age_months, group.max_age_months)})`,
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Date bounds depend on "today", so they are filled in after mount to keep
  // the server and client markup identical.
  const [today, setToday] = useState('');

  useEffect(() => {
    const now = new Date();
    setToday(toIsoDate(now));
    setData((current) =>
      current.preferences.startDate
        ? current
        : {
            ...current,
            preferences: { ...current.preferences, startDate: toIsoDate(nextMonday(now)) },
          },
    );
  }, []);

  const updateChild = <K extends keyof ChildInfo>(key: K, value: ChildInfo[K]): void =>
    setData((current) => ({ ...current, childInfo: { ...current.childInfo, [key]: value } }));

  const updateParent = <K extends keyof ParentInfo>(key: K, value: ParentInfo[K]): void =>
    setData((current) => ({ ...current, parentInfo: { ...current.parentInfo, [key]: value } }));

  const updatePreferences = <K extends keyof PreferencesInfo>(
    key: K,
    value: PreferencesInfo[K],
  ): void =>
    setData((current) => ({ ...current, preferences: { ...current.preferences, [key]: value } }));

  /** Validates only the fields belonging to the given step. */
  function validateStep(step: number, source: RegistrationData): FieldErrors {
    const found: FieldErrors = {};

    if (step === 1) {
      const { firstName, lastName, dateOfBirth, gender, ageGroupId } = source.childInfo;
      if (firstName.trim().length < 2) found.firstName = "Please enter the child's first name.";
      if (lastName.trim().length < 2) found.lastName = "Please enter the child's last name.";

      if (!dateOfBirth) {
        found.dateOfBirth = 'Please enter a date of birth.';
      } else {
        const dob = parseIsoDate(dateOfBirth);
        if (!dob) {
          found.dateOfBirth = 'Please enter a valid date.';
        } else if (dob > new Date()) {
          found.dateOfBirth = 'Date of birth cannot be in the future.';
        } else {
          const age = yearsBetween(dob, new Date());
          if (age > 6) found.dateOfBirth = 'This nursery takes children up to 6 years old.';
        }
      }

      if (!gender) found.gender = 'Please select an option.';
      // Normally required, but not when the list could not be loaded — the
      // family should not be blocked by our own outage. The column is nullable
      // and the office confirms the group on the follow-up call.
      if (!ageGroupId && !ageGroupsFailed) found.ageGroupId = 'Please choose an age group.';
    }

    if (step === 2) {
      const { fullName, email, phoneNumber, relationship } = source.parentInfo;
      if (fullName.trim().length < 2) found.parentFullName = 'Please enter your full name.';
      if (!email.trim()) {
        found.email = 'Please enter your email address.';
      } else if (!EMAIL_PATTERN.test(email.trim())) {
        found.email = 'Please enter a valid email address.';
      }
      if (!phoneNumber.trim()) {
        found.phoneNumber = 'Please enter a phone number.';
      } else if (!PHONE_PATTERN.test(phoneNumber.trim())) {
        found.phoneNumber = 'Please enter a valid phone number.';
      }
      if (!relationship) found.relationship = 'Please select your relationship to the child.';
    }

    if (step === 3) {
      const { programType, startDate, agreedToTerms } = source.preferences;
      if (!programType) found.programType = 'Please choose a program type.';
      if (!startDate) {
        found.startDate = 'Please choose a preferred start date.';
      } else {
        const start = parseIsoDate(startDate);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (!start) {
          found.startDate = 'Please enter a valid date.';
        } else if (start < now) {
          found.startDate = 'Start date cannot be in the past.';
        }
      }
      if (!agreedToTerms) found.agreedToTerms = 'Please accept the terms to continue.';
    }

    return found;
  }

  const currentErrors = validateStep(currentStep, data);
  const isStepValid = Object.keys(currentErrors).length === 0;
  const errorFor = (key: string): string | undefined =>
    showErrors ? (errors[key] ?? currentErrors[key]) : undefined;

  const goToStep = (step: number): void => {
    setShowErrors(false);
    setErrors({});
    setCurrentStep(step);
  };

  const handleNext = (): void => {
    if (!isStepValid) {
      setErrors(currentErrors);
      setShowErrors(true);
      return;
    }
    goToStep(Math.min(currentStep + 1, TOTAL_STEPS));
  };

  const handlePrevious = (): void => goToStep(Math.max(currentStep - 1, 1));

  /**
   * Submits to the existing registrations API. The endpoint stores first name,
   * last name, email, phone and age group; the remaining detail collected here
   * has no columns yet and is not persisted.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (currentStep !== TOTAL_STEPS || isSubmitting) return;

    // Re-check every step, in case a value was cleared after it was validated.
    for (let step = 1; step < TOTAL_STEPS; step += 1) {
      const stepErrors = validateStep(step, data);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setShowErrors(true);
        setCurrentStep(step);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Field names match the registrations table. They used to be
        // first_name/last_name/email/phone, none of which are columns, and
        // age_group_id was cast to a Number when the column is a UUID.
        body: JSON.stringify({
          child_name: `${data.childInfo.firstName.trim()} ${data.childInfo.lastName.trim()}`.trim(),
          child_dob: data.childInfo.dateOfBirth,
          parent_name: data.parentInfo.fullName.trim(),
          parent_email: data.parentInfo.email.trim(),
          parent_phone: data.parentInfo.phoneNumber.trim(),
          age_group_id: data.childInfo.ageGroupId || null,
          // The rest of the form has no columns of its own, so it is kept as a
          // note rather than being silently discarded.
          message: buildRegistrationNotes(data),
        }),
      });

      if (!response.ok) throw new Error('Registration failed');

      const created: unknown = await response.json();
      const id =
        typeof created === 'object' && created !== null && 'id' in created
          ? String((created as { id: unknown }).id)
          : '';

      setConfirmation(id ? `REG-${id.slice(0, 8).toUpperCase()}` : 'REG-PENDING');
      setData(EMPTY_DATA);
      onSuccess?.();
    } catch {
      setSubmitError(
        `We could not submit your registration just now. Please try again, or call us on ${phone}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Success screen                                                          */
  /* ---------------------------------------------------------------------- */

  if (confirmation) {
    return (
      <div
        role="status"
        className={cx(
          'rounded-lg border-2 border-green-400 bg-green-50 p-6 text-center md:p-8',
          className,
        )}
      >
        <h2 className="text-2xl font-bold text-green-800 md:text-3xl lg:text-4xl">
          Registration Successful!
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-gray-700">
          Thank you for registering your child at Little Smarties. We&rsquo;ll be in touch soon to
          confirm enrollment and next steps.
        </p>

        <p className="mt-6 inline-block rounded-lg border border-green-300 bg-white px-4 py-2 font-mono text-lg font-bold text-green-800">
          Confirmation #: {confirmation}
        </p>

        <div className="mx-auto mt-6 max-w-xl text-left">
          <h3 className="mb-2 text-lg font-semibold text-gray-800">What to expect next</h3>
          <p className="text-base leading-relaxed text-gray-700">
            A confirmation email is on its way to the address you gave us. Our admissions team
            reviews each registration and will contact you within two working days to confirm a
            place and arrange a visit. If you need anything sooner, call us on {phone} and
            quote your confirmation number.
          </p>
        </div>

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
          title="Child's Information"
          subtitle="Tell us about your child"
        >
          <FormField
            label="Child's First Name"
            type="text"
            name="childFirstName"
            value={data.childInfo.firstName}
            onChange={(value) => updateChild('firstName', value)}
            error={errorFor('firstName')}
            required
          />
          <FormField
            label="Child's Last Name"
            type="text"
            name="childLastName"
            value={data.childInfo.lastName}
            onChange={(value) => updateChild('lastName', value)}
            error={errorFor('lastName')}
            required
          />
          <FormField
            label="Date of Birth"
            type="date"
            name="dateOfBirth"
            value={data.childInfo.dateOfBirth}
            onChange={(value) => updateChild('dateOfBirth', value)}
            error={errorFor('dateOfBirth')}
            max={today}
            required
          />

          <RadioGroup
            legend="Gender"
            name="gender"
            options={GENDER_OPTIONS}
            value={data.childInfo.gender}
            onChange={(value) => updateChild('gender', value as ChildInfo['gender'])}
            error={errorFor('gender')}
            required
          />

          <FormField
            label="Age Group"
            type="select"
            name="ageGroupId"
            value={data.childInfo.ageGroupId}
            onChange={(value) => updateChild('ageGroupId', value)}
            error={errorFor('ageGroupId')}
            options={ageGroupOptions}
            required
          />
          {ageGroupsFailed && (
            <p className="-mt-4 mb-6 text-sm text-amber-700">
              We couldn&rsquo;t load the programme list just now. You can still submit the form and
              we will confirm the right group with you, or call us on{' '}
              <a href={telHref(phone)} className="font-semibold underline">{phone}</a>.
            </p>
          )}

          <Checkbox
            label="My child has special needs"
            checked={data.childInfo.hasSpecialNeeds}
            onChange={(checked) => updateChild('hasSpecialNeeds', checked)}
          />

          <FormField
            label="Dietary Restrictions"
            type="textarea"
            name="dietaryRestrictions"
            value={data.childInfo.dietaryRestrictions}
            onChange={(value) => updateChild('dietaryRestrictions', value)}
            placeholder="Allergies, intolerances or anything else we should know"
            rows={3}
          />
        </FormStep>

        {/* ---------------------------- Step 2 ---------------------------- */}
        <FormStep
          stepNumber={2}
          currentStep={currentStep}
          title="Parent/Guardian Information"
          subtitle="Your contact details"
        >
          <FormField
            label="Parent/Guardian Full Name"
            type="text"
            name="parentFullName"
            value={data.parentInfo.fullName}
            onChange={(value) => updateParent('fullName', value)}
            error={errorFor('parentFullName')}
            autoComplete="name"
            required
          />
          <FormField
            label="Email Address"
            type="email"
            name="email"
            value={data.parentInfo.email}
            onChange={(value) => updateParent('email', value)}
            error={errorFor('email')}
            autoComplete="email"
            hint="Your confirmation will be sent here."
            required
          />
          <FormField
            label="Phone Number"
            type="tel"
            name="phoneNumber"
            value={data.parentInfo.phoneNumber}
            onChange={(value) => updateParent('phoneNumber', value)}
            error={errorFor('phoneNumber')}
            autoComplete="tel"
            placeholder="+971 50 123 4567"
            required
          />
          <FormField
            label="Secondary Phone"
            type="tel"
            name="secondaryPhone"
            value={data.parentInfo.secondaryPhone}
            onChange={(value) => updateParent('secondaryPhone', value)}
          />
          <FormField
            label="Address"
            type="text"
            name="address"
            value={data.parentInfo.address}
            onChange={(value) => updateParent('address', value)}
            autoComplete="street-address"
          />
          <FormField
            label="City"
            type="text"
            name="city"
            value={data.parentInfo.city}
            onChange={(value) => updateParent('city', value)}
            autoComplete="address-level2"
          />
          <FormField
            label="Relationship to Child"
            type="select"
            name="relationship"
            value={data.parentInfo.relationship}
            onChange={(value) => updateParent('relationship', value)}
            error={errorFor('relationship')}
            options={RELATIONSHIP_OPTIONS}
            required
          />
        </FormStep>

        {/* ---------------------------- Step 3 ---------------------------- */}
        <FormStep
          stepNumber={3}
          currentStep={currentStep}
          title="Enrollment Preferences"
          subtitle="Let us know your preferences"
        >
          <RadioGroup
            legend="Program Type"
            name="programType"
            options={PROGRAM_OPTIONS}
            value={data.preferences.programType}
            onChange={(value) =>
              updatePreferences('programType', value as PreferencesInfo['programType'])
            }
            error={errorFor('programType')}
            required
          />

          <FormField
            label="Preferred Start Date"
            type="date"
            name="startDate"
            value={data.preferences.startDate}
            onChange={(value) => updatePreferences('startDate', value)}
            error={errorFor('startDate')}
            min={today}
            required
          />

          <FormField
            label="Additional Requests/Questions"
            type="textarea"
            name="additionalRequests"
            value={data.preferences.additionalRequests}
            onChange={(value) => updatePreferences('additionalRequests', value)}
            rows={4}
          />

          <fieldset className="mb-6 md:mb-8">
            <legend className={LABEL_CLASSES}>Preferred Communication</legend>
            <div className="space-y-2">
              {COMMUNICATION_OPTIONS.map((option) => {
                const checked = data.preferences.communicationPreference.includes(option);
                return (
                  <label key={option} className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        updatePreferences(
                          'communicationPreference',
                          event.target.checked
                            ? [...data.preferences.communicationPreference, option]
                            : data.preferences.communicationPreference.filter(
                                (item) => item !== option,
                              ),
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

          <Checkbox
            label={
              <>
                I agree to the{' '}
                <Link href="/contact" className="font-semibold text-red-600 underline">
                  enrollment terms and conditions
                </Link>
              </>
            }
            checked={data.preferences.agreedToTerms}
            onChange={(checked) => updatePreferences('agreedToTerms', checked)}
            error={errorFor('agreedToTerms')}
          />
        </FormStep>

        {/* ---------------------------- Step 4 ---------------------------- */}
        <FormStep
          stepNumber={4}
          currentStep={currentStep}
          title="Review Your Information"
          subtitle="Please verify all details before submitting"
        >
          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Child Information</h3>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="min-h-11 text-sm font-semibold text-red-600 underline transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Edit
              </button>
            </div>
            <dl className="divide-y divide-gray-200">
              <ReviewRow
                label="Name"
                value={`${data.childInfo.firstName} ${data.childInfo.lastName}`.trim()}
              />
              <ReviewRow label="Date of Birth" value={formatDisplayDate(data.childInfo.dateOfBirth)} />
              <ReviewRow
                label="Gender"
                value={
                  GENDER_OPTIONS.find((option) => option.value === data.childInfo.gender)?.label ?? ''
                }
              />
              <ReviewRow
                label="Age Group"
                value={labelFor(ageGroupOptions, data.childInfo.ageGroupId)}
              />
              <ReviewRow
                label="Special Needs"
                value={data.childInfo.hasSpecialNeeds ? 'Yes' : 'No'}
              />
              <ReviewRow
                label="Dietary Restrictions"
                value={data.childInfo.dietaryRestrictions || 'None given'}
              />
            </dl>
          </section>

          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Parent Information</h3>
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="min-h-11 text-sm font-semibold text-red-600 underline transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Edit
              </button>
            </div>
            <dl className="divide-y divide-gray-200">
              <ReviewRow label="Name" value={data.parentInfo.fullName} />
              <ReviewRow label="Email" value={data.parentInfo.email} />
              <ReviewRow label="Phone" value={data.parentInfo.phoneNumber} />
              <ReviewRow label="Secondary Phone" value={data.parentInfo.secondaryPhone} />
              <ReviewRow
                label="Address"
                value={[data.parentInfo.address, data.parentInfo.city].filter(Boolean).join(', ')}
              />
              <ReviewRow label="Relationship" value={data.parentInfo.relationship} />
            </dl>
          </section>

          <section className="mb-6 rounded-lg bg-gray-50 p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Preferences</h3>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="min-h-11 text-sm font-semibold text-red-600 underline transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Edit
              </button>
            </div>
            <dl className="divide-y divide-gray-200">
              <ReviewRow
                label="Program Type"
                value={
                  PROGRAM_OPTIONS.find((option) => option.value === data.preferences.programType)
                    ?.label ?? ''
                }
              />
              <ReviewRow label="Start Date" value={formatDisplayDate(data.preferences.startDate)} />
              <ReviewRow
                label="Communication"
                value={data.preferences.communicationPreference.join(', ') || 'No preference'}
              />
              <ReviewRow
                label="Additional Requests"
                value={data.preferences.additionalRequests || 'None given'}
              />
            </dl>
          </section>

          {submitError && (
            <p role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
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
            The keys matter. Without them React reconciles these two buttons to
            the same DOM node and merely flips type="button" to type="submit".
            Advancing from step 3 mutates the attribute while the click is still
            being dispatched, so the browser then treats that very click as a
            form submission and skips the review step. Distinct keys force a
            remount, so the clicked node is gone before the default action runs.
          */}
          {currentStep < TOTAL_STEPS ? (
            <Button key="next" variant="primary" size="lg" onClick={handleNext} disabled={!isStepValid}>
              Next
            </Button>
          ) : (
            <Button key="submit" type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit Registration'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default RegistrationForm;
