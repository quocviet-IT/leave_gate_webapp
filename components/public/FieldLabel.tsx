/**
 * A field's label, and a tag when the field may be left alone.
 *
 * Nearly everything on this form is required, so marking the required fields
 * would put a mark beside almost every line and tell the reader nothing. The
 * exceptions are the information, so the exceptions are what carry a mark.
 */
export default function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: string;
  optional?: boolean;
}) {
  return (
    <span className="field-label">
      <label htmlFor={htmlFor}>{children}</label>
      {optional ? <span className="optional">Không bắt buộc</span> : null}
    </span>
  );
}
