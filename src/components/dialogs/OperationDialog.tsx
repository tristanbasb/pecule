import { Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { cn } from '../../lib/cn';
import { isValidISODate, today } from '../../lib/dates';
import { computePositions, positionKey, resolvePrice } from '../../lib/finance';
import { amountToInput, formatMoney, formatNumber, parseAmount, quantityToInput } from '../../lib/format';
import { OP_TYPES, accountKind } from '../../lib/meta';
import type { InvestmentOp, OpType } from '../../lib/types';
import { deleteOperations, saveOperation } from '../../store/actions';
import { useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { getSnapshot } from '../../store/selectors';
import { closeOperation, useUi } from '../../store/ui';
import { AccountPicker, AssetPicker } from '../pickers';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input, Segmented, Textarea } from '../ui/fields';
import { openAssetDialog } from './AssetDialog';

const FORM_ID = 'operation-form';

const TYPE_ORDER: OpType[] = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'interest', 'fee'];

const TYPE_HINTS: Partial<Record<OpType, string>> = {
  deposit: 'Argent versé sur le compte : compté comme un apport.',
  withdrawal: 'Argent retiré du compte : réduit les apports.',
  dividend: 'Dividende reçu en espèces sur le compte.',
  interest: 'Intérêts crédités (fonds euros, espèces rémunérées…).',
  fee: 'Frais de gestion ou de garde prélevés sur le compte.',
};

export function OperationDialog() {
  const { open, editId, draft } = useUi((s) => s.opDialog);
  const existing = useDb((s) => (editId ? s.data.operations.find((o) => o.id === editId) : undefined));
  const hasInvestAccount = useDb((s) => s.data.accounts.some((a) => !a.archived && accountKind(a.type) === 'invest'));

  return (
    <Dialog
      open={open}
      onClose={closeOperation}
      title={existing ? "Modifier l'opération" : 'Nouvelle opération'}
      width={600}
      footer={
        hasInvestAccount ? (
          <>
            {existing && (
              <Button
                variant="ghost"
                className="mr-auto text-bad hover:bg-bad-soft hover:text-bad"
                onClick={() => {
                  deleteOperations([existing.id]);
                  closeOperation();
                  notifyDone('Opération supprimée');
                }}
              >
                <Trash2 /> Supprimer
              </Button>
            )}
            <Button onClick={closeOperation}>Annuler</Button>
            <Button type="submit" form={FORM_ID} variant="primary">
              {existing ? 'Enregistrer' : "Ajouter l'opération"}
            </Button>
          </>
        ) : undefined
      }
    >
      {hasInvestAccount ? (
        <OperationForm key={editId ?? 'new'} existing={existing} draft={draft} />
      ) : (
        <p className="text-sm text-ink-2">
          Créer d'abord un compte de placement (PEA, compte-titres, assurance-vie, PER ou crypto) depuis la page Comptes.
        </p>
      )}
    </Dialog>
  );
}

type Payment = 'cash' | 'new';

function OperationForm({ existing, draft }: { existing?: InvestmentOp; draft?: Partial<InvestmentOp> }) {
  const data = useDb((s) => s.data);
  const init = existing ?? draft ?? {};
  const investAccounts = data.accounts.filter((a) => !a.archived && accountKind(a.type) === 'invest');

  const [type, setType] = useState<OpType>(init.type ?? 'buy');
  const [accountId, setAccountId] = useState(init.accountId ?? investAccounts[0]?.id ?? '');
  const [assetId, setAssetId] = useState(init.assetId ?? '');
  const [quantity, setQuantity] = useState(quantityToInput(init.quantity));
  const [unitPrice, setUnitPrice] = useState(amountToInput(init.unitPrice));
  const [fees, setFees] = useState(amountToInput(init.fees));
  const [amount, setAmount] = useState(amountToInput(init.amount));
  const [date, setDate] = useState(init.date ?? today());
  const [note, setNote] = useState(init.note ?? '');
  const snapshot = getSnapshot(data);
  const accountCash = snapshot.byId.get(accountId)?.cash ?? 0;
  const [payment, setPayment] = useState<Payment>(existing ? (existing.newMoney ? 'new' : 'cash') : accountCash > 1 ? 'cash' : 'new');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const withAsset = OP_TYPES[type].withAsset;
  const isTrade = type === 'buy' || type === 'sell';
  const qty = parseAmount(quantity);
  const price = parseAmount(unitPrice);
  const feeValue = fees.trim() ? parseAmount(fees) : 0;
  const gross = (qty ?? 0) * (price ?? 0);
  const total = type === 'buy' ? gross + (feeValue ?? 0) : gross - (feeValue ?? 0);

  const held = useMemo(() => {
    if (!assetId || !accountId) return 0;
    const others = data.operations.filter((o) => o.id !== existing?.id);
    return computePositions(others, date).get(positionKey(accountId, assetId))?.quantity ?? 0;
  }, [data.operations, existing?.id, assetId, accountId, date]);

  function pickAsset(id: string) {
    setAssetId(id);
    const asset = data.assets.find((a) => a.id === id);
    if (asset && isTrade && !unitPrice.trim()) {
      const info = resolvePrice(asset);
      if (info) setUnitPrice(amountToInput(info.price));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!accountId) next.account = 'Choisir un compte.';
    if (!isValidISODate(date)) next.date = 'Saisir une date valide.';
    if (withAsset && type !== 'dividend' && !assetId) next.asset = 'Choisir un titre.';
    if (isTrade) {
      if (qty === null || qty <= 0) next.quantity = 'Saisir une quantité supérieure à 0.';
      if (price === null || price <= 0) next.unitPrice = 'Saisir un cours supérieur à 0.';
      if (feeValue === null || feeValue < 0) next.fees = 'Saisir des frais valides.';
      if (type === 'sell' && qty !== null && qty > held + 1e-9) {
        next.quantity = held > 0 ? `Seulement ${formatNumber(held)} titres détenus à cette date.` : 'Aucun titre détenu à cette date.';
      }
    } else {
      const v = parseAmount(amount);
      if (v === null || v <= 0) next.amount = 'Saisir un montant supérieur à 0.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    saveOperation({
      id: existing?.id,
      createdAt: existing?.createdAt,
      accountId,
      date,
      type,
      assetId: withAsset && assetId ? assetId : undefined,
      quantity: isTrade ? (qty as number) : undefined,
      unitPrice: isTrade ? (price as number) : undefined,
      fees: isTrade && feeValue ? feeValue : undefined,
      amount: isTrade ? undefined : (parseAmount(amount) as number),
      newMoney: type === 'buy' ? payment === 'new' : undefined,
      note: note.trim() || undefined,
    });
    notifyDone(existing ? 'Opération modifiée' : 'Opération ajoutée');
    closeOperation();
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Type d'opération" className="flex flex-wrap gap-1.5">
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cn(
              'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
              type === t ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink-2 hover:border-field hover:text-ink',
            )}
          >
            {OP_TYPES[t].label}
          </button>
        ))}
      </div>
      {TYPE_HINTS[type] && <p className="-mt-1 text-[13px] text-ink-3">{TYPE_HINTS[type]}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Compte" error={errors.account} hint={`Espèces disponibles : ${formatMoney(accountCash)}`}>
          {(id, describedBy) => (
            <AccountPicker id={id} kinds={['invest']} value={accountId} onChange={setAccountId} describedBy={describedBy} invalid={Boolean(errors.account)} />
          )}
        </Field>
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => (
            <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-describedby={describedBy} aria-invalid={Boolean(errors.date) || undefined} />
          )}
        </Field>
      </div>

      {withAsset && (
        <Field
          label={type === 'dividend' ? 'Titre (facultatif)' : 'Titre'}
          error={errors.asset}
          hint={type === 'sell' && assetId ? `${formatNumber(held)} titres détenus à cette date` : undefined}
        >
          {(id, describedBy) => (
            <AssetPicker
              id={id}
              value={assetId}
              onChange={pickAsset}
              heldIn={accountId}
              describedBy={describedBy}
              invalid={Boolean(errors.asset)}
              onCreate={() => openAssetDialog({ onSaved: (asset) => pickAsset(asset.id) })}
            />
          )}
        </Field>
      )}

      {isTrade ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantité" error={errors.quantity}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="tnum text-right"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errors.quantity) || undefined}
                />
              )}
            </Field>
            <Field label="Cours unitaire" error={errors.unitPrice}>
              {(id, describedBy) => (
                <AmountInput id={id} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,00" aria-describedby={describedBy} aria-invalid={Boolean(errors.unitPrice) || undefined} />
              )}
            </Field>
            <Field label="Frais" error={errors.fees}>
              {(id, describedBy) => (
                <AmountInput id={id} value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0,00" aria-describedby={describedBy} aria-invalid={Boolean(errors.fees) || undefined} />
              )}
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-[13px] text-ink-2">{type === 'buy' ? 'Coût total, frais inclus' : 'Montant net perçu'}</span>
            <span className="display money tnum text-lg text-ink">{formatMoney(total)}</span>
          </div>

          {type === 'buy' && (
            <Field label="Payé avec">
              {() => (
                <Segmented<Payment>
                  label="Mode de financement"
                  value={payment}
                  onChange={setPayment}
                  className="w-full"
                  options={[
                    { value: 'cash', label: `Espèces du compte (${formatMoney(accountCash, { decimals: 0 })})` },
                    { value: 'new', label: 'Nouveau versement' },
                  ]}
                />
              )}
            </Field>
          )}
        </>
      ) : (
        <Field label="Montant" error={errors.amount}>
          {(id, describedBy) => (
            <AmountInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-describedby={describedBy} aria-invalid={Boolean(errors.amount) || undefined} />
          )}
        </Field>
      )}

      <Field label="Note (facultatif)">
        {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />}
      </Field>
    </form>
  );
}
