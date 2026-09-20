import { useState, type FormEvent, type ReactNode } from 'react';
import { isValidISODate, today } from '../../lib/dates';
import { amountToInput, parseAmountExpression } from '../../lib/format';
import type { ISODate } from '../../lib/types';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input } from '../ui/fields';

const FORM_ID = 'value-form';

interface ValueDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  label: string;
  submitLabel: string;
  initialValue?: number;
  allowNegative?: boolean;
  onSubmit: (date: ISODate, value: number) => void;
}

/** Saisie d'une valeur datée : estimation d'un bien, capital restant, cours manuel, solde constaté. */
export function ValueDialog({ open, onClose, title, description, label, submitLabel, initialValue, allowNegative, onSubmit }: ValueDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {submitLabel}
          </Button>
        </>
      }
    >
      <ValueForm key={String(open)} label={label} initialValue={initialValue} allowNegative={allowNegative} onSubmit={(d, v) => { onSubmit(d, v); onClose(); }} />
    </Dialog>
  );
}

function ValueForm({ label, initialValue, allowNegative, onSubmit }: Pick<ValueDialogProps, 'label' | 'initialValue' | 'allowNegative' | 'onSubmit'>) {
  const [value, setValue] = useState(amountToInput(initialValue));
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseAmountExpression(value);
    if (parsed === null || (!allowNegative && parsed < 0)) return setError('Saisir un montant valide.');
    if (!isValidISODate(date)) return setError('Saisir une date valide.');
    onSubmit(date, parsed);
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[1fr_160px]">
      <Field label={label} error={error}>
        {(id, describedBy) => (
          <AmountInput id={id} value={value} onChange={(e) => setValue(e.target.value)} data-autofocus="" aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} />
        )}
      </Field>
      <Field label="Date">
        {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
    </form>
  );
}
