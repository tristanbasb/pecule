import { ArrowLeftRight, Minus, Plus, Repeat, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createCategorizer } from '../../lib/categorize';
import { cn } from '../../lib/cn';
import { isValidISODate, today } from '../../lib/dates';
import { amountToInput, formatMoney, parseAmountExpression } from '../../lib/format';
import { accountKind } from '../../lib/meta';
import type { ID, PeculeData, Transaction, TxKind } from '../../lib/types';
import { deleteTransactions, saveTransaction } from '../../store/actions';
import { useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { closeTransaction, useUi } from '../../store/ui';
import { AccountPicker, CategoryPicker } from '../pickers';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Segmented, Textarea, inputClass } from '../ui/fields';
import { Badge } from '../ui/misc';

const FORM_ID = 'transaction-form';
const LAST_ACCOUNT = 'pecule:lastAccount';

function defaultAccount(data: PeculeData): ID {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(LAST_ACCOUNT);
  } catch {
    /* ignoré */
  }
  const open = data.accounts.filter((a) => !a.archived);
  if (remembered && open.some((a) => a.id === remembered)) return remembered;
  return (open.find((a) => accountKind(a.type) === 'cash') ?? open[0])?.id ?? '';
}

export function TransactionDialog() {
  const { open, editId, draft } = useUi((s) => s.txDialog);
  const existing = useDb((s) => (editId ? s.data.transactions.find((t) => t.id === editId) : undefined));
  const hasAccounts = useDb((s) => s.data.accounts.length > 0);

  const footer = hasAccounts ? (
    <>
      {existing && (
        <Button
          variant="ghost"
          className="mr-auto text-bad hover:bg-bad-soft hover:text-bad"
          onClick={() => {
            deleteTransactions([existing.id]);
            closeTransaction();
            notifyDone('Transaction supprimée');
          }}
        >
          <Trash2 /> Supprimer
        </Button>
      )}
      {/* Le bouton principal vient en premier dans le DOM : c'est lui qu'active la touche Entrée. */}
      <Button type="submit" form={FORM_ID} value="close" variant="primary" className="order-last">
        {existing ? 'Enregistrer' : 'Ajouter'}
      </Button>
      {!existing && (
        <Button type="submit" form={FORM_ID} value="again" className="max-sm:hidden">
          Enregistrer et continuer
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={closeTransaction}
      title={existing ? 'Modifier la transaction' : 'Nouvelle transaction'}
      width={560}
      footer={footer}
    >
      {hasAccounts ? (
        <TransactionForm key={editId ?? 'new'} existing={existing} draft={draft} />
      ) : (
        <p className="text-sm text-ink-2">Créer d'abord un compte depuis la page Comptes pour y enregistrer des transactions.</p>
      )}
    </Dialog>
  );
}

function TransactionForm({ existing, draft }: { existing?: Transaction; draft?: Partial<Transaction> }) {
  const data = useDb((s) => s.data);
  const init = existing ?? draft ?? {};
  const [kind, setKind] = useState<TxKind>(init.kind ?? 'expense');
  const [amount, setAmount] = useState(amountToInput(init.amount));
  const [label, setLabel] = useState(init.label ?? '');
  const [date, setDate] = useState(init.date ?? today());
  const [accountId, setAccountId] = useState(init.accountId ?? defaultAccount(data));
  const [toAccountId, setToAccountId] = useState(init.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(init.categoryId ?? '');
  const [categoryTouched, setCategoryTouched] = useState(Boolean(init.categoryId));
  const [note, setNote] = useState(init.note ?? '');
  const [showNote, setShowNote] = useState(Boolean(init.note));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const categorizer = useMemo(
    () => createCategorizer({ rules: data.rules, transactions: data.transactions, categories: data.categories }),
    [data.rules, data.transactions, data.categories],
  );
  const suggestion = !categoryTouched && kind !== 'transfer' && label.trim().length > 2 ? categorizer.suggest(label, kind) : undefined;
  const effectiveCategory = categoryTouched ? categoryId : (suggestion ?? categoryId);
  const parsed = parseAmountExpression(amount);
  const isExpression = /\d\s*[+−-]\s*\d/.test(amount);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const again = submitter?.value === 'again';
    const next: Record<string, string> = {};
    if (parsed === null || parsed <= 0) next.amount = 'Saisir un montant supérieur à 0.';
    if (!accountId) next.account = 'Choisir un compte.';
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) next.toAccount = 'Choisir un compte de destination différent.';
    if (kind !== 'transfer' && !label.trim()) next.label = 'Saisir un libellé.';
    if (!isValidISODate(date)) next.date = 'Saisir une date valide.';
    setErrors(next);
    if (Object.keys(next).length || parsed === null) return;

    saveTransaction({
      id: existing?.id,
      createdAt: existing?.createdAt,
      kind,
      amount: Math.abs(parsed),
      label: label.trim() || 'Virement',
      date,
      accountId,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      categoryId: kind === 'transfer' ? undefined : effectiveCategory || undefined,
      note: note.trim() || undefined,
      recurringId: existing?.recurringId,
      importHash: existing?.importHash,
      adjustment: existing?.adjustment,
    });
    try {
      localStorage.setItem(LAST_ACCOUNT, accountId);
    } catch {
      /* ignoré */
    }
    notifyDone(existing ? 'Transaction modifiée' : 'Transaction ajoutée');
    if (again) {
      setAmount('');
      setLabel('');
      setNote('');
      setShowNote(false);
      setCategoryId('');
      setCategoryTouched(false);
      amountRef.current?.focus();
    } else {
      closeTransaction();
    }
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Segmented<TxKind>
        label="Type de transaction"
        value={kind}
        onChange={setKind}
        className="w-full"
        options={[
          { value: 'expense', label: 'Dépense', icon: <Minus /> },
          { value: 'income', label: 'Revenu', icon: <Plus /> },
          { value: 'transfer', label: 'Virement', icon: <ArrowLeftRight /> },
        ]}
      />

      <Field
        label="Montant"
        error={errors.amount}
        hint={isExpression && parsed !== null ? `= ${formatMoney(parsed)}` : undefined}
      >
        {(id, describedBy) => (
          <div className="relative">
            <input
              ref={amountRef}
              id={id}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.amount) || undefined}
              className={cn(inputClass, 'display tnum h-14 pr-10 text-right text-[28px] font-semibold')}
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xl text-ink-3">
              €
            </span>
          </div>
        )}
      </Field>

      <Field label={kind === 'transfer' ? 'Libellé (facultatif)' : 'Libellé'} error={errors.label}>
        {(id, describedBy) => (
          <Input
            id={id}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'income' ? 'Ex. Salaire de septembre' : kind === 'transfer' ? 'Ex. Épargne du mois' : 'Ex. Courses Carrefour'}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errors.label) || undefined}
            maxLength={140}
          />
        )}
      </Field>

      {kind === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Depuis" error={errors.account}>
            {(id, describedBy) => (
              <AccountPicker id={id} value={accountId} onChange={setAccountId} describedBy={describedBy} invalid={Boolean(errors.account)} />
            )}
          </Field>
          <Field label="Vers" error={errors.toAccount}>
            {(id, describedBy) => (
              <AccountPicker
                id={id}
                value={toAccountId}
                onChange={setToAccountId}
                exclude={accountId}
                describedBy={describedBy}
                invalid={Boolean(errors.toAccount)}
              />
            )}
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Catégorie"
            aside={
              suggestion && suggestion === effectiveCategory ? (
                <Badge tone="brand">
                  <Sparkles /> Suggérée
                </Badge>
              ) : undefined
            }
          >
            {(id, describedBy) => (
              <CategoryPicker
                id={id}
                kind={kind}
                value={effectiveCategory}
                onChange={(v) => {
                  setCategoryId(v);
                  setCategoryTouched(true);
                }}
                describedBy={describedBy}
              />
            )}
          </Field>
          <Field label="Compte" error={errors.account}>
            {(id, describedBy) => (
              <AccountPicker id={id} value={accountId} onChange={setAccountId} describedBy={describedBy} invalid={Boolean(errors.account)} />
            )}
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.date) || undefined}
            />
          )}
        </Field>
        {!showNote && (
          <div className="flex items-end pb-2">
            <button type="button" onClick={() => setShowNote(true)} className="text-[13px] font-medium text-brand-text hover:underline">
              Ajouter une note
            </button>
          </div>
        )}
      </div>

      {showNote && (
        <Field label="Note">
          {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} autoFocus={!init.note} />}
        </Field>
      )}

      {existing?.recurringId && (
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <Repeat className="size-3.5" /> Créée automatiquement par une transaction récurrente.
        </p>
      )}
    </form>
  );
}
