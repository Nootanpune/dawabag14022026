'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CODE = /^[A-Za-z0-9]{10}$/;

/** Enter the 10-character code printed on a Dawabag e-prescription. */
export default function VerifyCodeForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (!CODE.test(c)) return setError('The code is 10 letters and digits');
        setError('');
        router.push(`/eprescriptions/verify/${c}`);
      }}
      className="flex flex-wrap gap-2 items-start"
    >
      <div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={10}
          placeholder="e.g. AB3CD4EF5G"
          className="input font-mono uppercase max-w-[14rem]"
          aria-label="E-prescription code"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
      <button type="submit" className="btn-primary text-sm">
        Check
      </button>
    </form>
  );
}
