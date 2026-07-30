"use client";

export default function PrintButton() {
  return (
    <button className="button button--primary" type="button" onClick={() => window.print()}>
      In poster
    </button>
  );
}
