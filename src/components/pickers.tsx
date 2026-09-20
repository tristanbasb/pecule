import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { ACCOUNT_TYPES, ASSET_CLASSES, KIND_LABELS, KIND_ORDER, accountKind } from '../lib/meta';
import type { AccountKind, ID, TxKind } from '../lib/types';
import { useDb } from '../store/db';
import { IconChip } from './ui/misc';
import { Picker, type PickerOption } from './ui/Picker';

interface BaseProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

export function CategoryPicker({ kind, ...props }: BaseProps & { kind: TxKind }) {
  const categories = useDb((s) => s.data.categories);
  const options = useMemo<PickerOption[]>(() => {
    const primary = kind === 'income' ? 'income' : 'expense';
    const list = categories
      .filter((c) => !c.archived || c.id === props.value)
      .sort((a, b) => Number(a.type !== primary) - Number(b.type !== primary) || collator.compare(a.name, b.name));
    return [
      { value: '', label: 'Sans catégorie', icon: <IconChip icon="package" color={undefined} size="xs" className="opacity-60" /> },
      ...list.map((c) => ({
        value: c.id,
        label: c.name,
        group: c.type === 'expense' ? 'Dépenses' : 'Revenus',
        description: kind === 'income' && c.type === 'expense' ? 'Compté comme un remboursement' : undefined,
        icon: <IconChip icon={c.icon} color={c.color} size="xs" />,
      })),
    ];
  }, [categories, kind, props.value]);

  return (
    <Picker
      {...props}
      value={props.value ?? ''}
      options={options}
      placeholder="Choisir une catégorie"
      searchPlaceholder="Rechercher une catégorie"
    />
  );
}

export function AccountPicker({
  kinds,
  exclude,
  placeholder = 'Choisir un compte',
  ...props
}: BaseProps & { kinds?: AccountKind[]; exclude?: ID; placeholder?: string }) {
  const accounts = useDb((s) => s.data.accounts);
  const options = useMemo<PickerOption[]>(
    () =>
      accounts
        .filter((a) => (!a.archived || a.id === props.value) && a.id !== exclude)
        .filter((a) => !kinds || kinds.includes(accountKind(a.type)))
        .sort(
          (a, b) =>
            KIND_ORDER.indexOf(accountKind(a.type)) - KIND_ORDER.indexOf(accountKind(b.type)) ||
            collator.compare(a.name, b.name),
        )
        .map((a) => ({
          value: a.id,
          label: a.name,
          group: KIND_LABELS[accountKind(a.type)],
          description: [ACCOUNT_TYPES[a.type].label, a.institution].filter(Boolean).join(' · '),
          icon: <IconChip icon={ACCOUNT_TYPES[a.type].icon} color={a.color} size="xs" />,
        })),
    [accounts, kinds, exclude, props.value],
  );
  return (
    <Picker
      {...props}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Rechercher un compte"
      emptyText="Aucun compte de ce type"
    />
  );
}

export function AssetPicker({ onCreate, heldIn, ...props }: BaseProps & { onCreate: () => void; heldIn?: ID }) {
  const assets = useDb((s) => s.data.assets);
  const operations = useDb((s) => s.data.operations);
  const options = useMemo<PickerOption[]>(() => {
    const inAccount = new Set(operations.filter((o) => heldIn && o.accountId === heldIn).map((o) => o.assetId));
    return [...assets]
      .sort((a, b) => Number(!inAccount.has(a.id)) - Number(!inAccount.has(b.id)) || collator.compare(a.name, b.name))
      .map((a) => ({
        value: a.id,
        label: a.name,
        group: heldIn ? (inAccount.has(a.id) ? 'Dans ce compte' : 'Autres titres') : undefined,
        description: [a.symbol, ASSET_CLASSES[a.assetClass].label].filter(Boolean).join(' · '),
        keywords: a.isin,
      }));
  }, [assets, operations, heldIn]);
  return (
    <Picker
      {...props}
      options={options}
      placeholder="Choisir un titre"
      searchPlaceholder="Rechercher un titre"
      emptyText="Aucun titre enregistré"
      footer={(close) => (
        <button
          type="button"
          onClick={() => {
            close();
            onCreate();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand-text hover:bg-brand-soft"
        >
          <Plus className="size-4" /> Ajouter un titre
        </button>
      )}
    />
  );
}
