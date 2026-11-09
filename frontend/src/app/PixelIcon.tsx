const ink = '#3d2725';

const icons = {
  home: (
    <>
      <path fill={ink} d="M7 1h2v1h2v2h2v2h2v3h-2v6H3V9H1V6h2V4h2V2h2z" />
      <path fill="#ca754e" d="M7 2h2v2h2v2h2v2H3V6h2V4h2z" />
      <path fill="#f1d7a3" d="M4 9h8v5H4z" />
      <path fill="#497d76" d="M5 10h2v2H5zm3 1h3v3H8z" />
    </>
  ),
  map: (
    <>
      <path fill={ink} d="M1 4h3V2h3v2h3V2h5v11h-4v2H9v-2H6v2H1z" />
      <path fill="#d7e4a6" d="M2 5h3V3h1v9H5v2H2z" />
      <path fill="#8bb077" d="M7 5h3v7H7zm4-2h3v9h-3z" />
      <path fill="#376e8d" d="M3 10h2V8h2V6h3v2H7v2H5v2H3z" />
      <path fill="#f9e4a9" d="M12 5h1v2h-1z" />
    </>
  ),
  clothes: (
    <>
      <path fill={ink} d="M6 2h4v1h2v1h2v2h1v4h-3v5H4v-5H1V6h1V4h2V3h2z" />
      <path fill="#a69aca" d="M5 4h1v2h4V4h1v1h2v2h1v2h-2V7h-1v7H5V7H4v2H2V7h1V5h2z" />
      <path fill="#e7dff4" d="M6 3h4v1H6zm0 5h1v5H6z" />
    </>
  ),
  journal: (
    <>
      <path fill={ink} d="M3 1h10v1h1v11h-1v2H3v-1H2V2h1z" />
      <path fill="#6599b9" d="M4 2h9v9H4zm-1 1h1v8H3z" />
      <path fill="#fff0cf" d="M4 12h8v2H4zM6 5h5v1H6zm0 2h4v1H6z" />
      <path fill="#edb857" d="M9 1h3v4l-1-1h-1L9 5z" />
    </>
  ),
  badge: (
    <>
      <path fill={ink} d="M1 3h14v10H1z" />
      <path fill="#8dbab2" d="M2 4h12v8H2z" />
      <path fill="#fff0cf" d="M4 5h3v3H4zM3 9h5v2H3zm6-3h4v1H9zm0 3h4v1H9z" />
    </>
  ),
  board: (
    <>
      <path fill={ink} d="M1 2h14v11H1zm2 11h2v2H3zm8 0h2v2h-2z" />
      <path fill="#548568" d="M2 3h12v8H2z" />
      <path fill="#e0aa6b" d="M2 11h12v1H2z" />
      <path fill="#f4e9b8" d="M4 5h7v1H4zm0 2h4v1H4zm7 3h2v1h-2z" />
    </>
  ),
  people: (
    <>
      <path fill={ink} d="M3 2h4v1h1v5h2v1h1v5H1V9h1V8h1zm8 1h3v1h1v4h-1v1h1v1h1v4h-4V9h-2V4h1z" />
      <path fill="#e7ba83" d="M4 3h3v4H4zm7 1h3v4h-3z" />
      <path fill="#8d86ad" d="M3 9h6v1h1v3H2v-3h1z" />
      <path fill="#86a877" d="M12 9h2v1h1v3h-3z" />
    </>
  ),
  key: (
    <>
      <path fill={ink} d="M3 2h5v1h2v2h1v2h4v4h-2v2h-3v-2H8v1H3v-1H1V9H0V5h1V3h2z" />
      <path
        fill="#e8b95d"
        d="M3 3h5v1h1v2h1v2h4v2h-2v2h-1v-2H8v1H3v-1H2V8H1V6h1V4h1zm0 2v4h4V5z"
        fillRule="evenodd"
      />
    </>
  ),
  exit: (
    <>
      <path fill={ink} d="M2 1h9v5h1V4h2v2h1v2h1v2h-1v2h-1v2h-2v-2h-1v3H2z" />
      <path fill="#c78960" d="M3 2h6v5H7v4h2v3H3z" />
      <path fill="#f2d38a" d="M13 6h1v2h1v2h-1v2h-1v-2H8V8h5z" />
    </>
  ),
  signup: (
    <>
      <path fill={ink} d="M1 3h14v10H1z" />
      <path fill="#f5d89b" d="M2 4h12v8H2z" />
      <path fill="#98623f" d="M3 5h2v1h2v1h2V6h2V5h2v1h-2v1H9v1H7V7H5V6H3z" />
      <path fill="#487554" d="M11 7h2v2h2v2h-2v2h-2v-2H9V9h2z" />
    </>
  ),
  close: (
    <>
      <path
        fill={ink}
        d="M3 2h2l3 3 3-3h2l2 2v2l-3 2 3 3v2l-2 2h-2l-3-3-3 3H3l-2-2v-2l3-3-3-2V4z"
      />
      <path fill="#d8916d" d="M4 4h1l3 3 3-3h1v1L9 8l3 4v1h-1l-3-4-3 4H4v-1l3-4-3-3z" />
    </>
  ),
  chest: (
    <>
      <path fill={ink} d="M3 3h10v1h2v9h-1v1H2v-1H1V4h2z" />
      <path fill="#b97949" d="M2 5h12v3H2zm0 5h12v3H2z" />
      <path fill="#f0c46c" d="M3 4h10v1H3zm1 1h1v8H4zm7 0h1v8h-1zM7 8h2v3H7z" />
    </>
  ),
  forward: (
    <>
      <path fill={ink} d="M2 3h3v1h2v2h1V3h3v1h2v2h2v4h-2v2h-2v1H8v-3H7v2H5v1H2z" />
      <path fill="#86b1c8" d="M3 4h1v1h2v2h2v2H6v2H4v1H3zm6 0h1v1h2v2h2v2h-2v2h-2v1H9z" />
    </>
  ),
};

export function PixelIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      className="pixel-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}
