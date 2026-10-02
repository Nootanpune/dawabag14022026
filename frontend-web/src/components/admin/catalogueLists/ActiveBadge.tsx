/** "In use" / "Switched off" next to a list entry. */
export default function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">In the pick-list</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Switched off</span>;
}
