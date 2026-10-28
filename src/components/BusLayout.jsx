import React, { useMemo } from 'react';
import SteeringWheel from './SteeringWheel';

// Luxo is intentionally laid out seat-by-seat so seats 9–13 align exactly
// with the requested final row. Shuttle uses two seats across; Luxury uses
// four seats across and keeps any partial final row centred within that row.
function makeRows(type, capacity) {
  if (type === 'Luxo') {
    return [
      { left: [1], middle: null, right: [3] },
      { left: [2], middle: null, right: [4] },
      { left: [5], middle: null, right: [7] },
      { left: [6], middle: null, right: [8] },
      { left: [9], middle: 13, right: [11] },
      { left: [10], middle: null, right: [12] },
    ];
  }
  if (type === 'Shuttle') {
    return Array.from({ length: 5 }, (_, i) => ({ left: [i * 2 + 1], middle: null, right: [i * 2 + 2] }));
  }
  const count = Math.max(4, Number(capacity) || 48);
  const rows = [];
  for (let n = 1; n <= count; n += 4) {
    const remaining = count - n + 1;
    const seats = Array.from({ length: Math.min(4, remaining) }, (_, i) => n + i);
    // Keep incomplete final rows aligned and visually centred, never hanging
    // a lone seat off the edge of the cabin.
    if (seats.length === 1) rows.push({ left: [], middle: seats[0], right: [] });
    else if (seats.length === 2) rows.push({ left: [seats[0]], middle: null, right: [seats[1]] });
    else if (seats.length === 3) rows.push({ left: [seats[0]], middle: seats[1], right: [seats[2]] });
    else rows.push({ left: seats.slice(0, 2), middle: null, right: seats.slice(2, 4) });
  }
  return rows;
}

function Seat({ number, selectedSeats, unavailable, onToggle }) {
  if (number == null) return null;
  const isUnavailable = unavailable.has(number);
  const isSelected = selectedSeats.includes(number);
  return <button
    key={number}
    type="button"
    aria-label={`Seat ${number}${isUnavailable ? ', unavailable' : isSelected ? ', selected' : ', available'}`}
    aria-pressed={isSelected}
    disabled={isUnavailable}
    className={`seat ${isUnavailable ? 'seat-booked' : isSelected ? 'seat-selected' : 'seat-available'}`}
    onClick={() => onToggle(number)}
    title={isUnavailable ? `Seat ${number} unavailable` : `Select seat ${number}`}
  >{number}</button>;
}

export default function BusLayout({ busType, capacity, selectedSeats = [], unavailableSeats = [], onToggle = () => {} }) {
  const rows = useMemo(() => makeRows(busType, capacity), [busType, capacity]);
  const unavailable = new Set(unavailableSeats.map(Number));
  const seatCount = busType === 'Luxo' ? 13 : busType === 'Shuttle' ? 10 : (Number(capacity) || 48);

  return <section className="seat-picker" aria-label={`${busType} passenger seating layout`}>
    <div className="seat-picker-head">
      <div><span className="eyebrow">SELECT YOUR SEATS</span><h3>{busType} bus interior</h3><p>Tap a blue seat to select it. Seats already booked are grey.</p></div>
      <span className="seat-count">{seatCount} passenger seats</span>
    </div>
    <div className="bus-map-scroll"><div className={`bus-map bus-map-${busType.toLowerCase()}`}>
      <div className="bus-front">
        <div className="cockpit-label">FRONT</div>
        <div className="driver-area"><div className="driver-seat"><span>DRIVER</span></div><div className="wheel-wrap"><SteeringWheel size={40}/><small>STEERING WHEEL</small></div><div className="front-door">ENTRY</div></div>
      </div>
      <div className="bus-cabin">
        <div className="seat-column-labels"><span>LEFT</span><span> AISLE / MIDDLE </span><span>RIGHT</span></div>
        {rows.map((row, i) => <div className={`seat-row ${row.middle != null ? 'seat-row-middle' : ''}`} key={`${busType}-${i}`}>
          <div className="seat-side"><Seat number={row.left[0]} selectedSeats={selectedSeats} unavailable={unavailable} onToggle={onToggle}/>{row.left.length > 1 && <div className="seat-pair">{row.left.slice(1).map(n => <Seat key={n} number={n} selectedSeats={selectedSeats} unavailable={unavailable} onToggle={onToggle}/>)}</div>}</div>
          <div className={row.middle != null ? 'middle-seat' : 'aisle'} aria-label={row.middle != null ? `Middle seat ${row.middle}` : 'Aisle'}>
            {row.middle != null ? <Seat number={row.middle} selectedSeats={selectedSeats} unavailable={unavailable} onToggle={onToggle}/> : <span/>}
          </div>
          <div className="seat-side"><Seat number={row.right[0]} selectedSeats={selectedSeats} unavailable={unavailable} onToggle={onToggle}/>{row.right.length > 1 && <div className="seat-pair">{row.right.slice(1).map(n => <Seat key={n} number={n} selectedSeats={selectedSeats} unavailable={unavailable} onToggle={onToggle}/>)}</div>}</div>
        </div>)}
      </div>
      <div className="bus-rear">BACK OF BUS</div>
    </div></div>
    <div className="seat-legend"><span><i className="legend-blue"/>Available</span><span><i className="legend-red"/>Selected</span><span><i className="legend-grey"/>Booked</span></div>
    <div className="selected-seat-summary"><span>Selected: <b>{selectedSeats.length ? selectedSeats.slice().sort((a,b)=>a-b).join(', ') : 'None'}</b></span><b>{selectedSeats.length} seat{selectedSeats.length === 1 ? '' : 's'}</b></div>
    {busType === 'Luxury' && <p className="layout-disclaimer">Luxury capacity is a configurable placeholder. Set VITE_LUXURY_SEAT_CAPACITY to the verified seat count before launch.</p>}
  </section>;
}
