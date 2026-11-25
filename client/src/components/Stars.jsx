// Star rating: read-only display, or a 1–5 picker when `onPick` is given.
export default function Stars({ value = 0, size = 16, onPick, label }) {
  const v = Math.round(Number(value) || 0);
  if (!onPick) {
    return (
      <span className="stars" style={{ fontSize: size }} aria-label={`${Number(value || 0).toFixed(1)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? 'on' : ''} aria-hidden="true">★</i>)}
      </span>
    );
  }
  return (
    <span className="stars pick" role="radiogroup" aria-label={label || 'Your rating'} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={v === i} aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className={i <= v ? 'on' : ''} onClick={() => onPick(i)}>★</button>
      ))}
    </span>
  );
}
