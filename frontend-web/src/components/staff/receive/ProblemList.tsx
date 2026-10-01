import { AlertCircle } from 'lucide-react';

/** Every problem with the receipt at once (client checks, or the server's 422 list). */
export default function ProblemList({ title, problems }: { title: string; problems: string[] }) {
  if (!problems.length) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="flex items-center gap-2 font-medium mb-1">
        <AlertCircle className="w-4 h-4" /> {title}
      </p>
      <ul className="list-disc pl-6 space-y-0.5">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
