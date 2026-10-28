import React, { useMemo } from 'react';
import SteeringWheel from './SteeringWheel';

/* These are provisional diagrams. Replace row positions from the owner's bus screenshots. */
function makeRows(type, capacity) {
  if (type === 'Shuttle') {
    return Array.from({ length: 5 }, (_, i) => ({ left: [i * 2 + 1], right: [i * 2 + 2] }));
  }
  if (type === 'Luxo') {
    return [
      { left: [1, 2], right: [3, 4] },
      { left: [5, 6], right: [7, 8] },
      { left: [9, 10], right: [11, 12] },
      { left: [13], right: [] },
    ];
  }
  const count = Math.max(1, Number(capacity) || 49);
  const rows = [];
  let n = 1;
  while (n <= count) {
    const remaining = count - n + 1;
    if (remaining === 1) rows.push({ left: [n], right: [] });
    else rows.push({ left: [n, n + 1], right: [n + 2, n + 3].filter(x => x <= count) });
    n += Math.min(4, remaining);
  }
  return rows;
}

export default function BusLayout({ busType, capacity, selectedSeats = [], unavailableSeats = [], onToggle = () => {} }) {
  const rows = useMemo(() => makeRows(busType, capacity), [busType, capacity]);
  const unavailable = new Set(unavailableSeats);
  return <section className="seat-picker" aria-label={`${busType} passenger seating layout`}>
    <div className="seat-picker-head"><div><span className="eyebrow">SELECT YOUR SEATS</span><h3>{busType} bus interior</h3><p>Choose a blue seat. The final positions will be matched to your reference photos.</p></div><span className="seat-count">{capacity} passenger seats</span></div>
    <div className="bus-map-scroll"><div className="bus-map">
      <div className="bus-front"><div className="cockpit-label">FRONT / DRIVER</div><div className="driver-area"><div className="driver-seat"><span>DRIVER</span></div><SteeringWheel size={40}/><div className="front-door">ENTRY</div></div></div>
      <div className="bus-cabin">{rows.map((row, i) => <div className="seat-row" key={`${busType}-${i}`}>
        <div className="seat-side">{row.left.map(n => <button key={n} type="button" aria-pressed={selectedSeats.includes(n)} disabled={unavailable.has(n)} className={`seat ${unavailable.has(n) ? 'seat-booked' : selectedSeats.includes(n) ? 'seat-selected' : 'seat-available'}`} onClick={() => onToggle(n)} title={unavailable.has(n) ? `Seat ${n} unavailable` : `Select seat ${n}`}>{n}</button>)}</div>
        <div className="aisle" aria-hidden="true"><span>{i === 0 ? 'AISLE' : ''}</span></div>
        <div className="seat-side">{row.right.map(n => <button key={n} type="button" aria-pressed={selectedSeats.includes(n)} disabled={unavailable.has(n)} className={`seat ${unavailable.has(n) ? 'seat-booked' : selectedSeats.includes(n) ? 'seat-selected' : 'seat-available'}`} onClick={() => onToggle(n)} title={unavailable.has(n) ? `Seat ${n} unavailable` : `Select seat ${n}`}>{n}</button>)}</div>
      </div>)}</div>
      <div className="bus-rear">REAR OF BUS</div>
    </div></div>
    <div className="seat-legend"><span><i className="legend-blue"/>Available</span><span><i className="legend-red"/>Selected</span><span><i className="legend-grey"/>Unavailable</span></div>
    <div className="selected-seat-summary"><span>Selected: <b>{selectedSeats.length ? selectedSeats.slice().sort((a,b)=>a-b).join(', ') : 'None'}</b></span><b>{selectedSeats.length} seat{selectedSeats.length === 1 ? '' : 's'}</b></div>
    <p className="layout-disclaimer">Temporary layout for development. Exact seating positions and Luxury capacity remain subject to the owner's reference screenshots and fleet details.</p>
  </section>;
}
