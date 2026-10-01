// Doctor profile form <-> API body. Fee is typed in rupees and sent in paise.
import { rupeesToPaise } from '../admin/format';
import { currentYearIST } from '../dates';
import type { DoctorProfile, ProfileInput } from './types';

export interface ProfileFormValues {
  full_name: string;
  qualification: string;
  council: string;
  nmc_reg_number: string;
  registration_year: string;
  speciality: string;
  clinic_name: string;
  fee_rupees: string;
  bio: string;
  languages: string;
}

export const EMPTY_PROFILE: ProfileFormValues = {
  full_name: '', qualification: '', council: '', nmc_reg_number: '', registration_year: '',
  speciality: '', clinic_name: '', fee_rupees: '', bio: '', languages: 'English',
};

export function formFromProfile(p: DoctorProfile): ProfileFormValues {
  return {
    full_name: p.full_name ?? '',
    qualification: p.qualification ?? '',
    council: p.council ?? '',
    nmc_reg_number: p.nmc_reg_number ?? '',
    registration_year: p.registration_year ? String(p.registration_year) : '',
    speciality: p.speciality ?? '',
    clinic_name: p.clinic_name ?? '',
    fee_rupees: p.consultation_fee_paise != null ? String(Number(p.consultation_fee_paise) / 100) : '',
    bio: p.bio ?? '',
    languages: (p.languages_spoken ?? []).join(', '),
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

/** Returns the body or the list of problems to show. The server checks everything again. */
export function buildProfileBody(v: ProfileFormValues): { body?: ProfileInput; problems: string[] } {
  const problems: string[] = [];
  if (v.full_name.trim().length < 3) problems.push('Full name: at least 3 characters');
  if (v.qualification.trim().length < 2) problems.push('Qualification: e.g. MBBS, MD (Medicine)');
  if (v.council.trim().length < 3) problems.push('Council: National Medical Commission or your State Medical Council');
  if (v.nmc_reg_number.trim().length < 3) problems.push('Registration number: at least 3 characters');
  const year = Number(v.registration_year);
  if (!Number.isInteger(year) || year < 1950 || year > currentYearIST()) problems.push('Registration year: a year from 1950');
  const fee = rupeesToPaise(v.fee_rupees || '0');
  if (fee == null || fee > 10_000_00) problems.push('Fee: ₹0 to ₹10,000');
  const languages = v.languages.split(',').map((s) => s.trim()).filter(Boolean);
  if (languages.length > 10) problems.push('At most 10 languages');
  if (problems.length) return { problems };
  return {
    problems,
    body: {
      full_name: v.full_name.trim(),
      qualification: v.qualification.trim(),
      council: v.council.trim(),
      nmc_reg_number: v.nmc_reg_number.trim(),
      registration_year: year,
      speciality: opt(v.speciality),
      clinic_name: opt(v.clinic_name),
      consultation_fee_paise: fee!,
      bio: opt(v.bio),
      languages_spoken: languages.length ? languages : undefined,
    },
  };
}
