import { Download, FileSpreadsheet, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryDialog } from '../components/dialogs/CategoryDialog';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Field, Input, Segmented, Select, Switch } from '../components/ui/fields';
import { Card, CardHeader, IconChip, Kbd, PageHeader, Spinner } from '../components/ui/misc';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { buildDemoData } from '../lib/demo';
import { emptyData, looksLikePeculeData, sanitizeData } from '../lib/defaults';
import { formatMoney, pluralize } from '../lib/format';
import { TX_KINDS } from '../lib/meta';
import type { Category, CategoryType, PeculeData } from '../lib/types';
import { deleteRule, replaceAllData, saveRule, updateSettings } from '../store/actions';
import { useDb } from '../store/db';
import { notifyDone } from '../store/feedback';
import { useCategoryMap, useData } from '../store/selectors';
import { setTheme, togglePrivacy, useUi, type ThemePref } from '../store/ui';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function transactionsCsv(data: PeculeData) {
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [['Date', 'Libellé', 'Montant', 'Type', 'Catégorie', 'Compte', 'Compte de destination', 'Note'].join(';')];
  for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const signed = t.kind === 'income' ? t.amount : -t.amount;
    lines.push(
      [
        t.date,
        cell(t.label),
        String(signed).replace('.', ','),
        TX_KINDS[t.kind],
        cell(t.categoryId ? (categories.get(t.categoryId) ?? '') : ''),
        cell(accounts.get(t.accountId) ?? ''),
        cell(t.toAccountId ? (accounts.get(t.toAccountId) ?? '') : ''),
        cell(t.note ?? ''),
      ].join(';'),
    );
  }
  return `﻿${lines.join('\r\n')}`;
}

export function SettingsPage() {
  const data = useData();
  const { theme, privacy } = useUi();
  const location = useDb((s) => s.location);
  const savedAt = useDb((s) => s.savedAt);
  const [name, setName] = useState(data.settings.displayName ?? '');
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: Category; type?: CategoryType }>({ open: false });
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; action: () => void }>(null);
  const [backups, setBackups] = useState<{ backups: string[]; dir: string } | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    api.backups().then(setBackups).catch(() => setBackups(null));
  }, [savedAt]);

  async function restore(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const payload = parsed?.data && looksLikePeculeData(parsed.data) ? parsed.data : parsed;
      if (!looksLikePeculeData(payload)) throw new Error('Ce fichier ne ressemble pas à une sauvegarde de Pécule.');
      const restored = sanitizeData(payload);
      setConfirm({
        title: 'Restaurer cette sauvegarde ?',
        message: `Les données actuelles seront remplacées par ${pluralize(restored.accounts.length, 'compte')} et ${pluralize(restored.transactions.length, 'transaction')}. La modification peut être annulée juste après.`,
        label: 'Restaurer',
        action: () => {
          replaceAllData({ ...restored, settings: { ...restored.settings, onboarded: true } });
          notifyDone('Sauvegarde restaurée');
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fichier illisible');
    }
  }

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Préférences" />
          <div className="flex flex-col gap-5 p-5">
            <Field label="Prénom ou surnom" hint="Affiché sur l'accueil.">
              {(id, describedBy) => (
                <Input
                  id={id}
                  value={name}
                  maxLength={30}
                  aria-describedby={describedBy}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() !== (data.settings.displayName ?? '') && updateSettings({ displayName: name.trim() || undefined })}
                />
              )}
            </Field>
            <Field label="Thème">
              {() => (
                <Segmented<ThemePref>
                  label="Thème"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: 'Automatique' },
                    { value: 'light', label: 'Clair' },
                    { value: 'dark', label: 'Sombre' },
                  ]}
                />
              )}
            </Field>
            <Switch checked={privacy} onChange={togglePrivacy} label="Mode discret" description="Floute les montants à l'écran ; survoler un montant pour le lire." />
          </div>
        </Card>

        <Card>
          <CardHeader title="Données" subtitle="Enregistrées automatiquement sur cet ordinateur" />
          <div className="flex flex-col gap-4 p-5">
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px]">
              <p className="text-ink-3">Fichier</p>
              <p className="mt-0.5 break-all font-mono text-[11.5px] text-ink">{location ?? '—'}</p>
              <p className="mt-2 text-ink-3">
                {backups ? `${pluralize(backups.backups.length, 'sauvegarde quotidienne', 'sauvegardes quotidiennes')} conservée${backups.backups.length > 1 ? 's' : ''} (30 jours)` : 'Sauvegardes quotidiennes automatiques'}
                {savedAt ? ` · dernier enregistrement ${formatDateTime(savedAt)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => download(`pecule-sauvegarde-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json')}>
                <Download /> Exporter une sauvegarde
              </Button>
              <Button onClick={() => download(`pecule-transactions-${stamp()}.csv`, transactionsCsv(data), 'text/csv;charset=utf-8')}>
                <FileSpreadsheet /> Exporter les transactions (CSV)
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                <Upload className="size-4" /> Restaurer
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void restore(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                disabled={demoLoading}
                onClick={() =>
                  setConfirm({
                    title: 'Charger la démonstration ?',
                    message: 'Les données actuelles seront remplacées par un jeu de données fictif. Exporter une sauvegarde avant si besoin.',
                    label: 'Charger la démonstration',
                    action: async () => {
                      setDemoLoading(true);
                      try {
                        const demo = await buildDemoData(async (s) => (await api.history('yahoo', s)).points);
                        replaceAllData({ ...demo, settings: data.settings });
                        notifyDone('Démonstration chargée');
                      } finally {
                        setDemoLoading(false);
                      }
                    },
                  })
                }
              >
                {demoLoading ? <Spinner /> : <Sparkles />} Charger la démonstration
              </Button>
              <Button
                variant="ghost"
                className="text-bad hover:bg-bad-soft hover:text-bad"
                onClick={() =>
                  setConfirm({
                    title: 'Tout effacer ?',
                    message: 'Comptes, transactions, placements et catégories seront supprimés. Les sauvegardes quotidiennes du dossier data/backups restent disponibles.',
                    label: 'Tout effacer',
                    action: () => {
                      replaceAllData(emptyData());
                      toast.success('Données effacées');
                    },
                  })
                }
              >
                <Trash2 /> Tout effacer
              </Button>
            </div>
          </div>
        </Card>

        <CategoriesCard onEdit={(category, type) => setCategoryDialog({ open: true, category, type })} />
        <RulesCard />

        <Card className="lg:col-span-2">
          <CardHeader title="Raccourcis clavier" />
          <ul className="grid gap-3 p-5 text-sm text-ink-2 sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <Kbd>N</Kbd> Nouvelle transaction
            </li>
            <li className="flex items-center gap-2">
              <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> Annuler la dernière modification
            </li>
            <li className="flex items-center gap-2">
              <Kbd>Ctrl</Kbd>+<Kbd>Y</Kbd> Rétablir
            </li>
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
            Cours fournis par Yahoo Finance et CoinGecko, à titre indicatif et sans garantie d'exactitude.
          </p>
        </Card>
      </div>

      <CategoryDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        defaultType={categoryDialog.type}
        onClose={() => setCategoryDialog({ open: false })}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label ?? 'Confirmer'}
        onConfirm={() => void confirm?.action()}
      />
    </>
  );
}

function CategoriesCard({ onEdit }: { onEdit: (category?: Category, type?: CategoryType) => void }) {
  const categories = useDb((s) => s.data.categories);
  const counts = useDb((s) => s.data.transactions);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of counts) if (t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [counts]);
  const [type, setType] = useState<CategoryType>('expense');
  const list = categories.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <Card>
      <CardHeader
        title="Catégories"
        action={
          <Button size="sm" variant="ghost" onClick={() => onEdit(undefined, type)}>
            <Plus /> Ajouter
          </Button>
        }
      />
      <div className="px-5 pt-3">
        <Segmented<CategoryType>
          label="Type de catégorie"
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Dépenses' },
            { value: 'income', label: 'Revenus' },
          ]}
        />
      </div>
      <ul className="grid gap-0.5 p-2 sm:grid-cols-2">
        {list.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onEdit(c)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2">
              <IconChip icon={c.icon} color={c.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                <span className="block text-xs text-ink-3">
                  {pluralize(usage.get(c.id) ?? 0, 'transaction')}
                  {c.budget ? ` · ${formatMoney(c.budget, { decimals: 0 })}/mois` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RulesCard() {
  const data = useData();
  const categories = useCategoryMap();
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const sorted = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <Card>
      <CardHeader title="Classement automatique" subtitle="Appliqué lors de la saisie et de l'import des relevés" />
      <form
        className="flex flex-wrap items-end gap-2 px-5 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pattern.trim() || !categoryId) return;
          saveRule(pattern, categoryId);
          notifyDone('Règle ajoutée');
          setPattern('');
        }}
      >
        <Field label="Si le libellé contient" className="min-w-40 flex-1">
          {(id) => <Input id={id} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ex. NAVIGO" maxLength={60} />}
        </Field>
        <Field label="Classer dans" className="min-w-40 flex-1">
          {(id) => (
            <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choisir…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={!pattern.trim() || !categoryId}>
          Ajouter
        </Button>
      </form>
      <ul className="flex flex-col p-2 pt-3">
        {data.rules.length === 0 && (
          <li className="px-3 py-3 text-sm text-ink-3">
            Aucune règle : le classement s'appuie déjà sur les transactions passées et les marchands courants.
          </li>
        )}
        {data.rules.map((r) => {
          const c = categories.get(r.categoryId);
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-mono text-[12px] text-ink">« {r.pattern} »</span>
                <span className="text-ink-3"> → </span>
                <span className="font-medium text-ink">{c?.name ?? 'Catégorie supprimée'}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Supprimer la règle ${r.pattern}`}
                onClick={() => {
                  deleteRule(r.id);
                  notifyDone('Règle supprimée');
                }}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
