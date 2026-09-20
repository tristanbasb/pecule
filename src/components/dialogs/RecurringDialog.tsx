import { ArrowLeftRight, Minus, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { addDays, formatDate, isValidISODate, today } from '../../lib/dates';
import { amountToInput, parseAmountExpression, pluralize } from '../../lib/format';
import { FREQUENCIES } from '../../lib/meta';
import { dueOccurrences, nextOccurrence } from '../../lib/recurring';
import type { Frequency, Recurring, TxKind } from '../../lib/types';
import { deleteRecurring, saveRecurring } from '../../store/actions';
import { useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { AccountPicker, CategoryPicker } from '../pickers';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input, Segmented, Select, Switch } from '../ui/fields';

const FORM_ID = 'recurring-form';

interface RecurringDialogProps {
  open: boolean;
  onClose: () => void;
  recurring?: Recurring;
}

export function RecurringDialog({ open, onClose, recurring }: RecurringDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={recurring ? 'Modifier la récurrence' : 'Nouvelle transaction récurrente'}
      description="Loyer, salaire, abonnements… La transaction est créée automatiquement à chaque échéance."
      width={580}
      footer={
        <>
          {recurring && (
            <Button
              variant="ghost"
              className="mr-auto text-bad hover:bg-bad-soft hover:text-bad"
              onClick={() => {
                deleteRecurring(recurring.id);
                notifyDone('Récurrence supprimée', 'Les transactions déjà créées sont conservées.');
                onClose();
              }}
            >
              <Trash2 /> Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {recurring ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <RecurringForm key={recurring?.id ?? 'new'} recurring={recurring} onDone={onClose} />
    </Dialog>
  );
}

function RecurringForm({ recurring, onDone }: { recurring?: Recurring; onDone: () => void }) {
  const accounts = useDb((s) => s.data.accounts);
  const [kind, setKind] = useState<TxKind>(recurring?.kind ?? 'expense');
  const [label, setLabel] = useState(recurring?.label ?? '');
  const [amount, setAmount] = useState(amountToInput(recurring?.amount));
  const [accountId, setAccountId] = useState(recurring?.accountId ?? accounts.find((a) => !a.archived)?.id ?? '');
  const [toAccountId, setToAccountId] = useState(recurring?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(recurring?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(recurring?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(recurring?.startDate ?? today());
  const [endDate, setEndDate] = useState(recurring?.endDate ?? '');
  const [active, setActive] = useState(recurring?.active ?? true);
  const [createPast, setCreatePast] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const draft: Recurring = {
    id: recurring?.id ?? 'draft',
    label,
    kind,
    amount: 1,
    accountId,
    frequency,
    startDate: isValidISODate(startDate) ? startDate : today(),
    endDate: endDate || undefined,
    active: true,
    createdAt: '',
  };
  const past = recurring ? [] : dueOccurrences(draft, today());
  const next = nextOccurrence({ ...draft, lastDate: recurring?.lastDate }, addDays(today(), recurring ? 0 : -1));

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseAmountExpression(amount);
    const nextErrors: Record<string, string> = {};
    if (!label.trim()) nextErrors.label = 'Saisir un libellé.';
    if (value === null || value <= 0) nextErrors.amount = 'Saisir un montant supérieur à 0.';
    if (!accountId) nextErrors.account = 'Choisir un compte.';
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) nextErrors.toAccount = 'Choisir un compte de destination différent.';
    if (!isValidISODate(startDate)) nextErrors.startDate = 'Saisir une date valide.';
    if (endDate && (!isValidISODate(endDate) || endDate < startDate)) nextErrors.endDate = 'La date de fin doit suivre la première échéance.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || value === null) return;

    const pastDates = recurring ? [] : dueOccurrences({ ...draft, startDate }, today());
    saveRecurring({
      id: recurring?.id,
      createdAt: recurring?.createdAt,
      label: label.trim(),
      kind,
      amount: Math.abs(value),
      accountId,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      categoryId: kind === 'transfer' ? undefined : categoryId || undefined,
      frequency,
      startDate,
      endDate: endDate || undefined,
      active,
      // Sans rattrapage, les échéances passées sont considérées comme déjà traitées.
      lastDate: recurring ? recurring.lastDate : !createPast && pastDates.length ? pastDates[pastDates.length - 1] : undefined,
    });
    notifyDone(recurring ? 'Récurrence modifiée' : 'Récurrence créée');
    onDone();
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Segmented<TxKind>
        label="Type"
        value={kind}
        onChange={setKind}
        className="w-full"
        options={[
          { value: 'expense', label: 'Dépense', icon: <Minus /> },
          { value: 'income', label: 'Revenu', icon: <Plus /> },
          { value: 'transfer', label: 'Virement', icon: <ArrowLeftRight /> },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Libellé" error={errors.label}>
          {(id, describedBy) => (
            <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Loyer" maxLength={140} aria-describedby={describedBy} aria-invalid={Boolean(errors.label) || undefined} />
          )}
        </Field>
        <Field label="Montant" error={errors.amount}>
          {(id, describedBy) => (
            <AmountInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-describedby={describedBy} aria-invalid={Boolean(errors.amount) || undefined} />
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === 'transfer' ? 'Depuis' : 'Compte'} error={errors.account}>
          {(id, describedBy) => <AccountPicker id={id} value={accountId} onChange={setAccountId} describedBy={describedBy} invalid={Boolean(errors.account)} />}
        </Field>
        {kind === 'transfer' ? (
          <Field label="Vers" error={errors.toAccount}>
            {(id, describedBy) => (
              <AccountPicker id={id} value={toAccountId} onChange={setToAccountId} exclude={accountId} describedBy={describedBy} invalid={Boolean(errors.toAccount)} />
            )}
          </Field>
        ) : (
          <Field label="Catégorie">
            {(id) => <CategoryPicker id={id} kind={kind} value={categoryId} onChange={setCategoryId} />}
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fréquence">
          {(id) => (
            <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {(Object.keys(FREQUENCIES) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCIES[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Première échéance" error={errors.startDate}>
          {(id, describedBy) => (
            <Input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-describedby={describedBy} />
          )}
        </Field>
        <Field label="Fin (facultatif)" error={errors.endDate}>
          {(id, describedBy) => <Input id={id} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-describedby={describedBy} />}
        </Field>
      </div>

      {next && <p className="text-[13px] text-ink-3">Prochaine échéance : {formatDate(next, 'long')}.</p>}

      {!recurring && past.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3">
          <Switch
            checked={createPast}
            onChange={setCreatePast}
            label={`Créer aussi les ${pluralize(past.length, 'échéance passée', 'échéances passées')}`}
            description="Utile pour reconstituer un historique ; sinon seules les échéances à venir sont créées."
          />
        </div>
      )}
      {recurring && (
        <Switch checked={active} onChange={setActive} label="Récurrence active" description="Une récurrence en pause ne crée plus de transactions." />
      )}
    </form>
  );
}
