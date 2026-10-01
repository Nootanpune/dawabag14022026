// Icon for a catalogue category tile (display only). Categories are free text
// from GET /products/categories, so the icon is picked by keyword.
import type { LucideIcon } from 'lucide-react';
import {
  Pill, Bug, Flame, HeartPulse, Droplet, Baby, Eye, Sparkles, Wind, Brain, Bone, Leaf, Syringe, Stethoscope,
} from 'lucide-react';

const RULES: [RegExp, LucideIcon][] = [
  [/antibiot|infect|antiviral|antifung/i, Bug],
  [/pain|fever|analges|inflamm/i, Flame],
  [/heart|cardi|blood pressure|hypertens/i, HeartPulse],
  [/diabet|sugar|insulin/i, Droplet],
  [/baby|child|paediat|pediat|mother/i, Baby],
  [/eye|ear|ophthal/i, Eye],
  [/skin|derma|hair|beauty/i, Sparkles],
  [/respir|cough|cold|asthma|allerg/i, Wind],
  [/neuro|mental|sleep|psych/i, Brain],
  [/bone|joint|ortho|calcium/i, Bone],
  [/vitamin|supplement|nutri|ayur|herbal/i, Leaf],
  [/inject|vaccin/i, Syringe],
  [/device|test|monitor|first aid/i, Stethoscope],
];

export function categoryIcon(category: string): LucideIcon {
  for (const [re, icon] of RULES) if (re.test(category)) return icon;
  return Pill;
}
