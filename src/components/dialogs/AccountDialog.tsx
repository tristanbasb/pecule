import { useState, type FormEvent } from 'react';
import { cn } from '../../lib/cn';
import { today } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/format';
import { getIcon } from '../../lib/icons';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_ORDER, COLOR_KEYS, COLOR_NAMES, accountKind, colorVar } from '../../lib/meta';
import type { Account, AccountType, ColorKey } from '../../lib/types';
import { saveAccount } from '../../store/actions';
import { notifyDone } from '../../store/feedback';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input } from '../ui/fields';

const FORM_ID = 'account-form';

const BALANCE_LABELS = {
  cash: { create: 'Solde actuel', edit: 'Solde de départ', hint: 'Solde avant la première transaction enregistrée.' },
  invest: {
    create: 'Espèces disponibles',
    edit: 'Espèces de départ',
    hint: 'Les titres détenus s’ajoutent ensuite avec des opérations d’achat.',
  },
  asset: { create: 'Valeur estimée', edit: 'Valeur de départ', hint: 'Mise à jour ensuite depuis la page du compte.' },
  liability: { create: 'Capital restant dû', edit: 'Capital de départ', hint: 'Mis à jour ensuite depuis la page du compte.' },
};

interface AccountDialogProps {
  open: boolean;
  onClose: () => void;
  account?: Account;
  onSaved?: (account: Account) => void;
}

export function AccountDialog({ open, onClose, account, onSaved }: AccountDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={account ? 'Modifier le compte' : 'Nouveau compte'}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {account ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </>
      }
    >
      <AccountForm
        key={account?.id ?? 'new'}
        account={account}
        onDone={(saved) => {
          onSaved?.(saved);
          onClose();
        }}
      />
    </Dialog>
  );
}

function AccountForm({ account, onDone }: { account?: Account; onDone: (a: Account) => void }) {
  const [type, setType] = useState<AccountType>(account?.type ?? 'courant');
  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [color, setColor] = useState<ColorKey>(account?.color ?? 'c1');
  const [balance, setBalance] = useState(amountToInput(account?.openingBalance));
  const [error, setError] = useState<string | null>(null);

  const kind = accountKind(type);
  const labels = BALANCE_LABELS[kind];

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = balance.trim() ? parseAmount(balance) : 0;
    if (value === null) return setError('Saisir un montant valide.');
    if ((kind === 'asset' || kind === 'liability') && value < 0) return setError('Saisir un montant positif.');
    const saved = saveAccount({
      id: account?.id,
      createdAt: account?.createdAt,
      archived: account?.archived,
      type,
      name: name.trim() || ACCOUNT_TYPES[type].label,
      institution: institution.trim() || undefined,
      color,
      openingBalance: value,
      openingDate: account?.openingDate ?? today(),
    });
    notifyDone(account ? 'Compte modifié' : 'Compte créé');
    onDone(saved);
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Type de compte</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACCOUNT_TYPE_ORDER.map((t) => {
            const meta = ACCOUNT_TYPES[t];
            const Icon = getIcon(meta.icon);
            const active = t === type;
            return (
              <label
                key={t}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                  active ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30' : 'border-line hover:border-field hover:bg-surface-2',
                )}
              >
                <input type="radio" name="account-type" value={t} checked={active} onChange={() => setType(t)} className="sr-only" />
                <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', active ? 'text-brand-text' : 'text-ink-3')} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{meta.label}</span>
                  <span className="block text-[11.5px] leading-snug text-ink-3">{meta.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom">
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={ACCOUNT_TYPES[type].label} maxLength={60} />
          )}
        </Field>
        <Field label="Établissement (facultatif)">
          {(id) => (
            <Input id={id} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ex. Boursorama, Crédit Agricole…" maxLength={60} />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={account ? labels.edit : labels.create} hint={labels.hint} error={error}>
          {(id, describedBy) => (
            <AmountInput
              id={id}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0,00"
              aria-describedby={describedBy}
              aria-invalid={Boolean(error) || undefined}
            />
          )}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Couleur</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((c) => (
              <label
                key={c}
                title={COLOR_NAMES[c]}
                className={cn(
                  'flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                  color === c && 'ring-2 ring-ink',
                )}
              >
                <input type="radio" name="account-color" value={c} checked={color === c} onChange={() => setColor(c)} className="sr-only" aria-label={COLOR_NAMES[c]} />
                <span className="size-6 rounded-full" style={{ backgroundColor: colorVar(c) }} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </form>
  );
}
