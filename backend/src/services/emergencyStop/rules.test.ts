import {
  DEFAULT_PUBLIC_MESSAGE, checkoutMessage, customerMessage, dispatchHeldMessage, isPausedLine, parsePauseState, publicStatus,
} from './rules';

describe('emergency stop for prescription-medicine sales (owner 2026-10-03, C-08)', () => {
  const paused = parsePauseState({ paused: true, reason: 'Gazette notification pending review', reference: 'GSR 123(E)', paused_at: '2026-10-03T05:00:00.000Z' });

  it('open by default: anything but an explicit pause is open', () => {
    expect(parsePauseState(undefined)).toEqual({ paused: false });
    expect(parsePauseState({ paused: 'yes' })).toEqual({ paused: false });
    expect(parsePauseState(null).paused).toBe(false);
  });

  it('covers lines that need a prescription for this buyer only', () => {
    expect(isPausedLine(paused, 'customer', 'Schedule H')).toBe(true);
    expect(isPausedLine(paused, 'customer', 'Schedule H1')).toBe(true);
    expect(isPausedLine(paused, 'customer', 'OTC')).toBe(false);
    expect(isPausedLine(paused, 'b2b_retailer', 'Schedule H1')).toBe(false);   // licensed trade buyer
    expect(isPausedLine({ paused: false }, 'customer', 'Schedule H')).toBe(false);
  });

  it('buyers read a plain message with the public reference, never the internal reason', () => {
    expect(customerMessage(paused)).toBe(`${DEFAULT_PUBLIC_MESSAGE} (Reference: GSR 123(E))`);
    expect(customerMessage(paused)).not.toMatch(/Gazette notification pending/);
    expect(checkoutMessage(paused, ['Azithromycin 500'])).toMatch(/remove Azithromycin 500 from your cart/);
    expect(publicStatus(paused)).toEqual({ rx_sales: 'paused', message: customerMessage(paused), reference: 'GSR 123(E)', since: '2026-10-03T05:00:00.000Z' });
    expect(publicStatus({ paused: false })).toEqual({ rx_sales: 'open', message: null, reference: null, since: null });
  });

  it('staff are told to hold the parcel, not that something broke', () => {
    const m = dispatchHeldMessage(paused, ['Alprazolam 0.25']);
    expect(m).toMatch(/Keep this parcel/);
    expect(m).toMatch(/Alprazolam 0\.25/);
    expect(m).toMatch(/GSR 123\(E\)/);
  });
});
