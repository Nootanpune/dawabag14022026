import type { PublicSections } from '@/lib/medicineInfo/types';
import SafetyAdvice from './SafetyAdvice';
import FactBox from './FactBox';

function Bullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

function Group({ title, items, tone }: { title: string; items?: string[]; tone?: 'warn' }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className={`text-sm font-semibold mb-1 ${tone === 'warn' ? 'text-red-800' : 'text-gray-800'}`}>{title}</h4>
      <Bullets items={items} />
    </div>
  );
}

const Para = ({ text }: { text?: string }) => (text ? <p className="whitespace-pre-line">{text}</p> : null);

/** The body of one medicine-information section. Only sections the server sent are rendered. */
export default function InfoSectionBody({ k, s }: { k: keyof PublicSections; s: PublicSections }) {
  switch (k) {
    case 'overview': return <Para text={s.overview} />;
    case 'how_to_use': return <Para text={s.how_to_use} />;
    case 'how_it_works': return <Para text={s.how_it_works} />;
    case 'missed_dose': return <Para text={s.missed_dose} />;
    case 'uses': return <Bullets items={s.uses} />;
    case 'quick_tips': return <Bullets items={s.quick_tips} />;
    case 'side_effects':
      return (
        <div className="space-y-3">
          <Group title="Common" items={s.side_effects?.common} />
          <Group title="Serious" items={s.side_effects?.serious} tone="warn" />
          <Group title="Contact your doctor if" items={s.side_effects?.contact_doctor_if} tone="warn" />
        </div>
      );
    case 'interactions':
      return (
        <div className="space-y-3">
          <Group title="With other medicines" items={s.interactions?.medicines} />
          <Group title="With food" items={s.interactions?.food} />
          <Group title="With health conditions" items={s.interactions?.conditions} />
        </div>
      );
    case 'safety': return <SafetyAdvice items={s.safety ?? []} />;
    case 'facts': return <FactBox facts={s.facts ?? {}} />;
    case 'faqs':
      return (
        <dl className="space-y-3">
          {s.faqs?.map((f, i) => (
            <div key={i}>
              <dt className="font-semibold text-gray-900">{f.question}</dt>
              <dd className="mt-0.5 whitespace-pre-line">{f.answer}</dd>
            </div>
          ))}
        </dl>
      );
    case 'references':
      return <Bullets items={s.references?.map((r) => (r.date ? `${r.source}, ${r.date}` : r.source))} />;
    default: return null;
  }
}
