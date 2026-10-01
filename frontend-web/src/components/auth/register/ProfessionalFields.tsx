import type { FieldErrors, UseFormRegister } from 'react-hook-form';
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
}

/** Business fields (retailer / wholesaler) or medical registration fields (doctor). */
export default function ProfessionalFields({ customerType, register, errors }: Props) {
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
        </>
      )}

      {isDoctor && (
        <>
          <Field label="NMC / Council registration number" error={errors.nmc_reg_number?.message}>
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
        </>
      )}
    </>
  );
}
