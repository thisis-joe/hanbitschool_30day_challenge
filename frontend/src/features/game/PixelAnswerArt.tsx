export function PixelAnswerArt({ choice }: { choice: 'O' | 'X' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
      {choice === 'O' ? (
        <path
          fillRule="evenodd"
          d="M6 2h12v2h4v4h2v8h-2v4h-4v2H6v-2H2v-4H0V8h2V4h4zm2 5v2H5v6h3v2h8v-2h3V9h-3V7z"
        />
      ) : (
        <path d="M1 2h6v3h3v3h4V5h3V2h6v6h-3v3h-3v2h3v3h3v6h-6v-3h-3v-3h-4v3H7v3H1v-6h3v-3h3v-2H4V8H1z" />
      )}
    </svg>
  );
}
