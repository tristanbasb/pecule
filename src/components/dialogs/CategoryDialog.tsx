import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { cn } from '../../lib/cn';
import { amountToInput, parseAmount } from '../../lib/format';
import { ICON_NAMES, getIcon } from '../../lib/icons';
import { COLOR_KEYS, COLOR_NAMES, colorVar } from '../../lib/meta';
import type { Category, CategoryType, ColorKey } from '../../lib/types';
import { deleteCategory, saveCategory } from '../../store/actions';
import { useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input, Segmented, Select } from '../ui/fields';
import { IconChip } from '../ui/misc';

const FORM_ID = 'category-form';

interface CategoryDialogProps {
  open: boolean;
  onClose: () => void;
  category?: Category;
  defaultType?: CategoryType;
}

export function CategoryDialog({ open, onClose, category, defaultType = 'expense' }: CategoryDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={() => {
        setConfirmDelete(false);
        onClose();
      }}
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      width={600}
      footer={
        <>
          {category && !confirmDelete && (
            <Button variant="ghost" className="mr-auto text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {category ? 'Enregistrer' : 'Créer la catégorie'}
          </Button>
        </>
      }
    >
      {confirmDelete && category ? (
        <DeleteCategory category={category} onCancel={() => setConfirmDelete(false)} onDeleted={onClose} />
      ) : (
        <CategoryForm key={category?.id ?? 'new'} category={category} defaultType={defaultType} onDone={onClose} />
      )}
    </Dialog>
  );
}

function CategoryForm({ category, defaultType, onDone }: { category?: Category; defaultType: CategoryType; onDone: () => void }) {
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType);
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'package');
  const [color, setColor] = useState<ColorKey>(category?.color ?? 'c1');
  const [budget, setBudget] = useState(amountToInput(category?.budget));
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Saisir un nom.');
    const value = budget.trim() ? parseAmount(budget) : undefined;
    if (value === null || (value !== undefined && value < 0)) return setError('Saisir un montant valide.');
    saveCategory({ id: category?.id, archived: category?.archived, type, name: name.trim(), icon, color, budget: value || undefined });
    notifyDone(category ? 'Catégorie modifiée' : 'Catégorie créée');
    onDone();
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <IconChip icon={icon} color={color} size="lg" />
        <Segmented<CategoryType>
          label="Type de catégorie"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Dépense' },
            { value: 'income', label: 'Revenu' },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" error={error}>
          {(id, describedBy) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-describedby={describedBy} data-autofocus="" />
          )}
        </Field>
        <Field
          label={type === 'expense' ? 'Budget mensuel (facultatif)' : 'Montant attendu par mois (facultatif)'}
        >
          {(id) => <AmountInput id={id} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0,00" />}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Couleur</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_KEYS.map((c) => (
            <label
              key={c}
              title={COLOR_NAMES[c]}
              className={cn(
                'flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                color === c && 'ring-2 ring-ink',
              )}
            >
              <input type="radio" name="category-color" checked={color === c} onChange={() => setColor(c)} className="sr-only" aria-label={COLOR_NAMES[c]} />
              <span className="size-6 rounded-full" style={{ backgroundColor: colorVar(c) }} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Icône</legend>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {ICON_NAMES.map((n) => {
            const Icon = getIcon(n);
            const active = icon === n;
            return (
              <label
                key={n}
                className={cn(
                  'flex aspect-square cursor-pointer items-center justify-center rounded-lg border transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                  active ? 'border-brand bg-brand-soft text-brand-text' : 'border-transparent text-ink-2 hover:bg-surface-3',
                )}
              >
                <input type="radio" name="category-icon" checked={active} onChange={() => setIcon(n)} className="sr-only" aria-label={n} />
                <Icon className="size-[18px]" />
              </label>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}

function DeleteCategory({ category, onCancel, onDeleted }: { category: Category; onCancel: () => void; onDeleted: () => void }) {
  const categories = useDb((s) => s.data.categories);
  const count = useDb((s) => s.data.transactions.filter((t) => t.categoryId === category.id).length);
  const [target, setTarget] = useState('');
  const others = categories.filter((c) => c.id !== category.id && c.type === category.type);
  return (
    <div className="flex flex-col gap-4 text-sm text-ink-2">
      <p>
        Supprimer la catégorie <strong className="text-ink">{category.name}</strong> ?
        {count > 0 ? ` ${count} transaction${count > 1 ? 's y sont rattachées' : ' y est rattachée'}.` : ' Aucune transaction n’y est rattachée.'}
      </p>
      {count > 0 && (
        <Field label="Déplacer ces transactions vers">
          {(id) => (
            <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Aucune catégorie</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Garder la catégorie</Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteCategory(category.id, target || undefined);
            notifyDone('Catégorie supprimée');
            onDeleted();
          }}
        >
          <Trash2 /> Supprimer
        </Button>
      </div>
    </div>
  );
}
