'use client';

import React, { useId, useState } from 'react';
import { AccordionItem } from './AccordionItem';

export interface AccordionEntry {
  /** Was a number when the entries were a hardcoded list; FAQs from the
      database key on a UUID, and both are only ever used as a key and an
      element id. */
  id: string | number;
  question: string;
  answer: string;
}

export interface AccordionProps {
  items: readonly AccordionEntry[];
  /** Allow several panels open at once. Defaults to classic single-open. */
  allowMultiple?: boolean;
  className?: string;
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/**
 * FAQ accordion. Every panel starts collapsed; clicking an open question closes
 * it again so the list can always be returned to its initial state.
 */
export function Accordion({ items, allowMultiple = false, className }: AccordionProps) {
  const baseId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<AccordionEntry['id']>>(() => new Set());

  const toggle = (id: AccordionEntry['id']): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cx('border-t border-gray-200', className)}>
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          id={`${baseId}-${item.id}`}
          question={item.question}
          answer={item.answer}
          isExpanded={expanded.has(item.id)}
          onToggle={() => toggle(item.id)}
        />
      ))}
    </div>
  );
}

export default Accordion;
