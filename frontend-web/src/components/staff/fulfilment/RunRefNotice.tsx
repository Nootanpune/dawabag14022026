/** The run reference (DWR…) the server generated for a rider dispatch (Sprint 13). */
export default function RunRefNotice({ runRef }: { runRef: string | null }) {
  return (
    <div className="text-sm space-y-2">
      <p>The parcel is out with our rider and is on their run sheet.</p>
      {runRef ? (
        <p className="bg-green-50 border border-green-200 rounded-lg p-3">
          Run reference (AWB): <span className="font-mono font-semibold text-green-800">{runRef}</span>
          <span className="block text-xs text-gray-500 mt-1">Write it on the pack label. The buyer is sent the same reference.</span>
        </p>
      ) : (
        <p className="text-xs text-gray-500">The run reference shows on the shipment in the Deliver queue.</p>
      )}
    </div>
  );
}
