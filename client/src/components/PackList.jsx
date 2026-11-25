// Coin packs as tappable rows: coins on the left, price on the right.
export default function PackList({ packs = [], onBuy, buying, disabled }) {
  return (
    <div className="pack-list">
      {packs.map((p, i) => (
        <button key={p.id} type="button" className={`pack-row press ${p.tag ? 'hot' : ''}`} style={{ '--i': i }}
          onClick={() => onBuy(p)} disabled={!!buying || disabled}>
          {p.tag && <span className="pack-tag">{p.tag}</span>}
          <span className="pack-coin" aria-hidden="true" />
          <span className="pack-amt">{p.coins.toLocaleString('en-IN')}<small>coins</small></span>
          <span className="pack-price">{buying === p.id ? 'Opening…' : `₹${p.price}`}</span>
        </button>
      ))}
    </div>
  );
}
