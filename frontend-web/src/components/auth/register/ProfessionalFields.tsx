import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import ExtraLicenceRows from './ExtraLicenceRows';
import {
  RETAILER_DL_TYPES,
  SPECIALITIES,
  WHOLESALER_DL_TYPES,
  type CustomerType,
  type DetailsFormValues,
} from '@/lib/registration';
import { Field } from './FormField';

interface Props {
  customerType: CustomerType;
  register: UseFormRegister<DetailsFormValues>;
  errors: FieldErrors<DetailsFormValues>;
  control: Control<DetailsFormValues>;
}

/** Business fields (retailer / wholesaler) or medical registration fields (doctor). */
export default function ProfessionalFields({ customerType, register, errors, control }: Props) {
  const isB2B = customerType === 'b2b_retailer' || customerType === 'b2b_wholesaler';
  const isDoctor = customerType === 'doc_hospital';
  const dlTypes = customerType === 'b2b_wholesaler' ? WHOLESALER_DL_TYPES : RETAILER_DL_TYPES;

  return (
    <>
      {isB2B && (
        <>
          <Field label="Business name" error={errors.business_name?.message}>
            <input {...register('business_name')} placeholder="Shah Medical Stores" className="input" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Drug license type" error={errors.drug_license_type?.message}>
              <select {...register('drug_license_type')} className="input">
                <option value="">Select</option>
                {dlTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Drug license number" error={errors.drug_license_number?.message}>
              <input {...register('drug_license_number')} placeholder="MH-NSK-123456" className="input" />
            </Field>
          </div>
          <ExtraLicenceRows control={control} register={register} errors={errors} />
        </>
      )}

      {isDoctor && (
        <>
          {/* Sprint 44: an institution names its responsible doctor's registration below (r.65(9)(b)) */}
          <Field label="Registering as" error={errors.practitioner_kind?.message}>
            <select {...register('practitioner_kind')} className="input">
              <option value="doctor">A doctor (my own registration)</option>
              <option value="institution">A hospital, clinic or nursing home</option>
            </select>
          </Field>
          <Field label="Hospital / clinic name (institutions)" error={errors.business_name?.message}>
            <input {...register('business_name')} placeholder="Sunrise Nursing Home" className="input" />
          </Field>
          <Field label="NMC / Council registration number (the responsible doctor's, for an institution)" error={errors.nmc_reg_number?.message}>
            <input {...register('nmc_reg_number')} placeholder="e.g. 2011/05/1234" className="input" />
          </Field>
          <Field label="Medical council" error={errors.nmc_council_state?.message}>
            <input
              {...register('nmc_council_state')}
              placeholder="Maharashtra Medical Council"
              className="input"
            />
          </Field>
          <Field label="Speciality" error={errors.speciality?.message}>
            <select {...register('speciality')} className="input">
              <option value="">Select</option>
              {SPECIALITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <ExtraLicenceRows control={control} register={register} errors={errors} optionalOnly />
        </>
      )}
    </>
  );
}
