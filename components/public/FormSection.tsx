import type { ReactNode } from "react";

/**
 * One named block of the form.
 *
 * The form asks for nine things. As one stack of nine identical rows it reads
 * as a chore; in four named blocks it reads as four short questions — who you
 * are, when, why, and what happens to your work. The blocks are not numbered
 * on purpose: this page replaced a three-step wizard, and numerals would put
 * the feeling of steps straight back.
 *
 * A fieldset rather than a div, so a screen reader announces the group name
 * with each field inside it.
 */
export default function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="form-section">
      <legend className="form-section__title">{title}</legend>
      <div className="form-section__body">{children}</div>
    </fieldset>
  );
}
