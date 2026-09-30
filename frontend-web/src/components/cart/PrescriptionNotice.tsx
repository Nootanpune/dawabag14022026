export default function PrescriptionNotice() {
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
      <span className="text-lg mt-0.5">📋</span>
      <div>
        <p className="font-medium text-amber-800">Prescription required</p>
        <p className="text-amber-700 text-xs mt-0.5">
          One or more items require a valid prescription. You&apos;ll upload it during checkout. Our pharmacist will
          call to verify before dispatch.
        </p>
      </div>
    </div>
  );
}
