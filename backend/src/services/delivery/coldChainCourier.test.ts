// Sprint 41 (URS-105, C-25): approved cold-chain couriers
import { approvedCouriers, coldChainCourierProblem } from './coldChainCourier';

describe('approved cold-chain couriers', () => {
  it('reads the comma-separated list; empty or unset = not enforced', () => {
    expect(approvedCouriers(' Cold Express ,  Dawabag   rider,,Cold Express ')).toEqual(['Cold Express', 'Dawabag rider']);
    expect(approvedCouriers(null)).toEqual([]);
    expect(approvedCouriers('')).toEqual([]);
  });
  it('allows a listed courier in any case or spacing, refuses others for cold-chain parcels only', () => {
    const list = ['Cold Express', 'Dawabag rider'];
    expect(coldChainCourierProblem(true, 'cold  EXPRESS', list)).toBeNull();
    expect(coldChainCourierProblem(true, 'Dawabag rider', list)).toBeNull();
    expect(coldChainCourierProblem(true, 'Speedy Post', list)).toMatch(/approved cold-chain courier: Cold Express, Dawabag rider/);
    expect(coldChainCourierProblem(true, undefined, list)).toMatch(/approved cold-chain courier/);
    expect(coldChainCourierProblem(false, 'Speedy Post', list)).toBeNull();
    expect(coldChainCourierProblem(true, 'Speedy Post', [])).toBeNull();
  });
});
