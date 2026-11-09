const cross = Array.from({ length: 36 }, (_, row) => {
  const x = 6 + Math.round((29 * row) / 35);
  const y = row + 6;
  return `M${x} ${y}h7v1h-7zM${41 - x} ${y}h7v1h-7z`;
}).join('');

export function PixelAnswerArt({ choice }: { choice: 'O' | 'X' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" shapeRendering="crispEdges">
      {choice === 'O' ? (
        <path
          fillRule="evenodd"
          d="M14 4h20v1h4v2h3v3h2v4h1v20h-1v4h-2v3h-3v2h-4v1H14v-1h-4v-2H7v-3H5v-4H4V14h1v-4h2V7h3V5h4zm1 8v2h-2v2h-1v16h1v2h2v2h18v-2h2v-2h1V16h-1v-2h-2v-2z"
        />
      ) : (
        <path d={cross} />
      )}
    </svg>
  );
}
