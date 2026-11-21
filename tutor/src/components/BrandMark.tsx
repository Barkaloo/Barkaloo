/** Open-book brackets shared by the app and sign-in. */
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" focusable="false">
        <path d="M28 16 11 26v15l17 10v-8l-11-6v-7l11-6V16Zm8 0 17 10v15L36 51v-8l11-6v-7l-11-6V16Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
