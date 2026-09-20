import { FileUp, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { createCategorizer } from '../../lib/categorize';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/dates';
import { formatMoney, pluralize, round2 } from '../../lib/format';
import { nowIso, uid } from '../../lib/id';
import {
  DATE_FORMATS,
  DELIMITERS,
  buildCandidates,
  decodeText,
  detectDelimiter,
  detectFormat,
  extractCsvEntries,
  guessMapping,
  parseCsv,
  parseOfx,
  parseQif,
  type CsvMapping,
  type FileFormat,
  type ImportCandidate,
  type ParsedEntry,
} from '../../lib/importer';
import { accountKind } from '../../lib/meta';
import type { DateFormat, PeculeData, Transaction } from '../../lib/types';
import { updateData, useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { setImportOpen, useUi } from '../../store/ui';
import { AccountPicker } from '../pickers';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Segmented, Select, Switch } from '../ui/fields';
import { Badge } from '../ui/misc';

type Step = 'file' | 'columns' | 'review';

interface ReviewRow extends ImportCandidate {
  include: boolean;
  categoryId: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

export function ImportDialog() {
  const open = useUi((s) => s.importOpen);
  return open ? <ImportWizard onClose={() => setImportOpen(false)} /> : null;
}

function firstCashAccount(data: PeculeData) {
  const open = data.accounts.filter((a) => !a.archived && ['cash', 'invest'].includes(accountKind(a.type)));
  return (open.find((a) => accountKind(a.type) === 'cash') ?? open[0])?.id ?? '';
}

function ImportWizard({ onClose }: { onClose: () => void }) {
  const data = useDb((s) => s.data);
  const [step, setStep] = useState<Step>('file');
  const [accountId, setAccountId] = useState(() => firstCashAccount(data));
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState<FileFormat>('csv');
  const [text, setText] = useState('');
  const [delimiter, setDelimiter] = useState(';');
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [keepBalance, setKeepBalance] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csvRows = useMemo(() => (format === 'csv' && text ? parseCsv(text, delimiter) : []), [format, text, delimiter]);
  const extracted = useMemo(() => (mapping && csvRows.length ? extractCsvEntries(csvRows, mapping) : null), [csvRows, mapping]);
  const categories = useMemo(() => data.categories.filter((c) => !c.archived), [data.categories]);

  async function loadFile(file: File) {
    setError(null);
    if (!accountId) return setError("Choisir d'abord le compte concerné.");
    if (file.size > MAX_BYTES) return setError('Fichier trop volumineux (20 Mo maximum).');
    const content = decodeText(await file.arrayBuffer());
    const fmt = detectFormat(content);
    setFileName(file.name);
    setText(content);
    setFormat(fmt);
    if (fmt === 'csv') {
      const profile = data.importProfiles.find((p) => p.accountId === accountId);
      const d = profile?.delimiter ?? detectDelimiter(content);
      const parsed = parseCsv(content, d);
      if (!parsed.length) return setError('Ce fichier est vide.');
      const width = Math.max(...parsed.slice(0, 30).map((r) => r.length));
      const fits =
        profile && Math.max(profile.dateCol, profile.labelCol, profile.amountCol, profile.debitCol, profile.creditCol) < width;
      const { accountId: _a, delimiter: _d, ...saved } = profile ?? ({} as never);
      setDelimiter(d);
      setMapping(fits ? saved : guessMapping(parsed));
      setStep('columns');
    } else {
      const list = fmt === 'ofx' ? parseOfx(content) : parseQif(content);
      if (!list.length) return setError('Aucune opération trouvée dans ce fichier.');
      review(list);
    }
  }

  function review(list: ParsedEntry[]) {
    const categorizer = createCategorizer(data);
    const candidates = buildCandidates(list, accountId, data.transactions);
    setRows(
      candidates.map((c) => ({
        ...c,
        include: !c.duplicateOf,
        categoryId: categorizer.suggest(c.label, c.amount < 0 ? 'expense' : 'income') ?? '',
      })),
    );
    setKeepBalance(!data.transactions.some((t) => t.accountId === accountId || t.toAccountId === accountId));
    setStep('review');
  }

  function doImport() {
    const selected = rows.filter((r) => r.include);
    if (!selected.length) return;
    const createdAt = nowIso();
    const txs: Transaction[] = selected.map((r) => ({
      id: uid(),
      date: r.date,
      label: r.label,
      amount: round2(Math.abs(r.amount)),
      kind: r.amount < 0 ? 'expense' : 'income',
      accountId,
      categoryId: r.categoryId || undefined,
      importHash: r.hash,
      createdAt,
    }));
    const delta = selected.reduce((s, r) => s + r.amount, 0);
    updateData((d) => ({
      ...d,
      transactions: [...d.transactions, ...txs],
      accounts: keepBalance
        ? d.accounts.map((a) => (a.id === accountId ? { ...a, openingBalance: round2(a.openingBalance - delta) } : a))
        : d.accounts,
      importProfiles:
        format === 'csv' && mapping
          ? [...d.importProfiles.filter((p) => p.accountId !== accountId), { accountId, delimiter, ...mapping }]
          : d.importProfiles,
    }));
    notifyDone(pluralize(txs.length, 'transaction importée', 'transactions importées'));
    onClose();
  }

  const includedCount = rows.filter((r) => r.include).length;

  const footer =
    step === 'file' ? (
      <Button onClick={onClose}>Annuler</Button>
    ) : step === 'columns' ? (
      <>
        <Button onClick={() => setStep('file')}>Retour</Button>
        <Button variant="primary" disabled={!extracted?.entries.length} onClick={() => extracted && review(extracted.entries)}>
          Continuer
        </Button>
      </>
    ) : (
      <>
        <Button onClick={() => (format === 'csv' ? setStep('columns') : setStep('file'))}>Retour</Button>
        <Button variant="primary" disabled={!includedCount} onClick={doImport}>
          Importer {pluralize(includedCount, 'transaction')}
        </Button>
      </>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Importer un relevé bancaire"
      description={
        step === 'file'
          ? "Fichier CSV, OFX ou QIF téléchargé depuis l'espace client de la banque."
          : `${fileName} · ${step === 'columns' ? 'Correspondance des colonnes' : 'Vérification avant import'}`
      }
      width={step === 'file' ? 560 : 920}
      footer={footer}
    >
      {step === 'file' && (
        <div className="flex flex-col gap-4">
          <Field label="Compte concerné">
            {(id) => <AccountPicker id={id} kinds={['cash', 'invest']} value={accountId} onChange={setAccountId} />}
          </Field>
          <label
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              dragging ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-field hover:bg-surface-2',
            )}
          >
            <FileUp className="size-7 text-ink-3" />
            <span className="text-sm font-medium text-ink">Déposer le fichier ici ou cliquer pour le choisir</span>
            <span className="text-xs text-ink-3">.csv, .ofx, .qfx ou .qif</span>
            <input
              type="file"
              accept=".csv,.txt,.ofx,.qfx,.qif,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm text-bad">
              <TriangleAlert className="size-4" /> {error}
            </p>
          )}
        </div>
      )}

      {step === 'columns' && mapping && (
        <ColumnsStep
          rows={csvRows}
          delimiter={delimiter}
          setDelimiter={setDelimiter}
          mapping={mapping}
          setMapping={setMapping}
          recognized={extracted?.entries.length ?? 0}
          skipped={extracted?.skipped ?? 0}
        />
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-4">
          <ReviewSummary rows={rows} />
          <div className="max-h-[46dvh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-ink-3">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={includedCount === rows.length}
                      onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))}
                      className="size-4 accent-[var(--brand)]"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Libellé</th>
                  <th className="px-2 py-2 font-medium">Catégorie</th>
                  <th className="px-3 py-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={`${r.hash}-${i}`} className={cn(!r.include && 'opacity-55')}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Importer ${r.label}`}
                        checked={r.include}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                        className="size-4 accent-[var(--brand)]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{formatDate(r.date, 'numeric')}</td>
                    <td className="max-w-[280px] px-2 py-1.5">
                      <span className="block truncate text-ink" title={r.label}>
                        {r.label}
                      </span>
                      {r.duplicateOf && <Badge tone="warn">Déjà présente</Badge>}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Catégorie de ${r.label}`}
                        value={r.categoryId}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}
                        className="h-8 w-full max-w-[200px] rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
                      >
                        <option value="">Sans catégorie</option>
                        <optgroup label="Dépenses">
                          {categories.filter((c) => c.type === 'expense').map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Revenus">
                          {categories.filter((c) => c.type === 'income').map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className={cn('money tnum whitespace-nowrap px-3 py-1.5 text-right font-medium', r.amount > 0 ? 'text-good' : 'text-ink')}>
                      {formatMoney(r.amount, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3">
            <Switch
              checked={keepBalance}
              onChange={setKeepBalance}
              label="Le solde actuel du compte inclut déjà ces opérations"
              description="Le solde de départ est alors ajusté pour que le solde actuel reste identique. À désactiver pour des opérations pas encore prises en compte."
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ReviewSummary({ rows }: { rows: ReviewRow[] }) {
  const included = rows.filter((r) => r.include);
  const credits = included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const debits = included.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const dates = rows.map((r) => r.date).sort();
  const duplicates = rows.filter((r) => r.duplicateOf).length;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-2">
      <span>
        <strong className="font-semibold text-ink">{included.length}</strong> sur {rows.length} sélectionnées
      </span>
      <span>
        Entrées <strong className="money tnum font-semibold text-good">{formatMoney(credits, { sign: true })}</strong>
      </span>
      <span>
        Sorties <strong className="money tnum font-semibold text-ink">{formatMoney(debits)}</strong>
      </span>
      {dates.length > 0 && (
        <span>
          Du {formatDate(dates[0], 'numeric')} au {formatDate(dates[dates.length - 1], 'numeric')}
        </span>
      )}
      {duplicates > 0 && (
        <Badge tone="warn">
          <TriangleAlert /> {pluralize(duplicates, 'doublon probable', 'doublons probables')} décoché{duplicates > 1 ? 's' : ''}
        </Badge>
      )}
    </div>
  );
}

interface ColumnsStepProps {
  rows: string[][];
  delimiter: string;
  setDelimiter: (d: string) => void;
  mapping: CsvMapping;
  setMapping: (m: CsvMapping) => void;
  recognized: number;
  skipped: number;
}

function ColumnsStep({ rows, delimiter, setDelimiter, mapping, setMapping, recognized, skipped }: ColumnsStepProps) {
  const width = Math.max(1, ...rows.slice(0, 40).map((r) => r.length));
  const header = mapping.skipRows > 0 ? rows[mapping.skipRows - 1] : undefined;
  const columns = Array.from({ length: width }, (_, i) => ({ index: i, name: header?.[i] || `Colonne ${i + 1}` }));
  const preview = rows.slice(mapping.skipRows, mapping.skipRows + 6);
  const split = mapping.amountCol < 0;
  const set = (patch: Partial<CsvMapping>) => setMapping({ ...mapping, ...patch });

  const roleOf = (i: number) =>
    i === mapping.dateCol ? 'Date' : i === mapping.labelCol ? 'Libellé' : i === mapping.amountCol ? 'Montant' : i === mapping.debitCol ? 'Débit' : i === mapping.creditCol ? 'Crédit' : null;

  const columnSelect = (value: number, onChange: (v: number) => void, id: string) => (
    <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {columns.map((c) => (
        <option key={c.index} value={c.index}>
          {c.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Séparateur">
          {(id) => (
            <Select id={id} value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
              {DELIMITERS.map((d) => (
                <option key={d.label} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Lignes à ignorer" hint="En-tête inclus">
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={30}
              value={mapping.skipRows}
              aria-describedby={describedBy}
              onChange={(e) => set({ skipRows: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
            />
          )}
        </Field>
        <Field label="Colonne de date">{(id) => columnSelect(mapping.dateCol, (v) => set({ dateCol: v }), id)}</Field>
        <Field label="Format de date">
          {(id) => (
            <Select id={id} value={mapping.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.replace('DD', 'JJ').replace('YYYY', 'AAAA').replace('YY', 'AA')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Colonne du libellé">{(id) => columnSelect(mapping.labelCol, (v) => set({ labelCol: v }), id)}</Field>
        <Field label="Montants">
          {() => (
            <Segmented<'single' | 'split'>
              label="Organisation des montants"
              value={split ? 'split' : 'single'}
              onChange={(v) =>
                v === 'split'
                  ? set({ amountCol: -1, debitCol: mapping.debitCol >= 0 ? mapping.debitCol : 0, creditCol: mapping.creditCol >= 0 ? mapping.creditCol : Math.min(1, width - 1) })
                  : set({ amountCol: Math.max(0, mapping.debitCol), debitCol: -1, creditCol: -1 })
              }
              className="w-full"
              options={[
                { value: 'single', label: 'Une colonne' },
                { value: 'split', label: 'Débit / crédit' },
              ]}
            />
          )}
        </Field>
        {split ? (
          <>
            <Field label="Colonne débit">{(id) => columnSelect(mapping.debitCol, (v) => set({ debitCol: v }), id)}</Field>
            <Field label="Colonne crédit">{(id) => columnSelect(mapping.creditCol, (v) => set({ creditCol: v }), id)}</Field>
          </>
        ) : (
          <Field label="Colonne du montant">{(id) => columnSelect(mapping.amountCol, (v) => set({ amountCol: v }), id)}</Field>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-left">
            <tr>
              {columns.map((c) => {
                const role = roleOf(c.index);
                return (
                  <th key={c.index} className="whitespace-nowrap px-3 py-2 align-bottom font-medium text-ink-2">
                    {role && <Badge tone="brand" className="mb-1 block w-fit">{role}</Badge>}
                    <span className="block max-w-[180px] truncate">{c.name}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {preview.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.index} className={cn('max-w-[220px] truncate whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px]', roleOf(c.index) ? 'text-ink' : 'text-ink-3')}>
                    {r[c.index] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={cn('text-sm', recognized ? 'text-ink-2' : 'text-bad')}>
        {recognized
          ? `${pluralize(recognized, 'opération reconnue', 'opérations reconnues')}${skipped ? ` · ${pluralize(skipped, 'ligne ignorée', 'lignes ignorées')}` : ''}`
          : 'Aucune opération reconnue : vérifier la colonne de date, son format et la colonne du montant.'}
      </p>
    </div>
  );
}
