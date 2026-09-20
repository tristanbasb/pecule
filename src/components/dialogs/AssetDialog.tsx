import { Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { create } from 'zustand';
import { api, type SearchResult } from '../../lib/api';
import { cn } from '../../lib/cn';
import { today } from '../../lib/dates';
import { formatDateTime } from '../../lib/dates';
import { formatPct, formatPrice, parseAmount } from '../../lib/format';
import { ASSET_CLASSES, ASSET_CLASS_ORDER } from '../../lib/meta';
import type { Asset, AssetClass, ID } from '../../lib/types';
import { saveAsset } from '../../store/actions';
import { useDb } from '../../store/db';
import { notifyDone } from '../../store/feedback';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AmountInput, Field, Input, Segmented, Select } from '../ui/fields';
import { Badge, Spinner } from '../ui/misc';

interface AssetDialogState {
  open: boolean;
  editId?: ID;
  onSaved?: (asset: Asset) => void;
}

const useAssetDialog = create<AssetDialogState>(() => ({ open: false }));

export const openAssetDialog = (opts: { editId?: ID; onSaved?: (asset: Asset) => void } = {}) =>
  useAssetDialog.setState({ open: true, ...opts });
const closeAssetDialog = () => useAssetDialog.setState({ open: false, editId: undefined, onSaved: undefined });

const FORM_ID = 'asset-form';

export function AssetDialogHost() {
  const { open, editId, onSaved } = useAssetDialog();
  const existing = useDb((s) => (editId ? s.data.assets.find((a) => a.id === editId) : undefined));
  return (
    <Dialog
      open={open}
      onClose={closeAssetDialog}
      title={existing ? 'Modifier le titre' : 'Ajouter un titre'}
      description={existing ? undefined : 'Action, ETF, fonds ou crypto : son cours sera mis à jour automatiquement.'}
      width={580}
      footer={
        <>
          <Button onClick={closeAssetDialog}>Annuler</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {existing ? 'Enregistrer' : 'Ajouter le titre'}
          </Button>
        </>
      }
    >
      <AssetForm
        key={editId ?? 'new'}
        existing={existing}
        onDone={(asset) => {
          onSaved?.(asset);
          closeAssetDialog();
        }}
      />
    </Dialog>
  );
}

function guessClass(type: string | undefined): AssetClass {
  switch (type) {
    case 'ETF':
      return 'etf';
    case 'Action':
      return 'action';
    case 'Crypto':
      return 'crypto';
    case 'Fonds':
      return 'fonds';
    default:
      return 'autre';
  }
}

interface Preview {
  price: number;
  currency: string;
  nativePrice: number;
  changePct: number | null;
  at: string;
}

type Mode = 'search' | 'manual';

function AssetForm({ existing, onDone }: { existing?: Asset; onDone: (asset: Asset) => void }) {
  const assets = useDb((s) => s.data.assets);
  const [mode, setMode] = useState<Mode>(existing?.provider === 'manual' ? 'manual' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(
    existing && existing.provider !== 'manual' && existing.symbol
      ? { provider: existing.provider, symbol: existing.symbol, name: existing.name }
      : null,
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [name, setName] = useState(existing?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass>(existing?.assetClass ?? 'etf');
  const [isin, setIsin] = useState(existing?.isin ?? '');
  const [manualPrice, setManualPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.search(q);
        if (!cancelled) {
          setResults(res.results);
          setSearchError(null);
        }
      } catch (err) {
        if (!cancelled) setSearchError(err instanceof Error ? err.message : 'Recherche indisponible');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function choose(result: SearchResult) {
    setSelected(result);
    setName(result.name);
    setAssetClass(guessClass(result.type));
    setError(null);
    setPreview(null);
    setQuoteError(null);
    setQuoteLoading(true);
    try {
      const res = await api.quotes(
        result.provider === 'yahoo' ? [result.symbol] : [],
        result.provider === 'coingecko' ? [result.symbol] : [],
      );
      const key = `${result.provider}:${result.symbol}`;
      const quote = res.quotes[key];
      if (!quote) throw new Error(res.errors[key] ?? 'Cours indisponible pour ce titre');
      const rate = res.fx[quote.currency];
      if (!rate) throw new Error(`Taux de change ${quote.currency} indisponible`);
      setPreview({ price: quote.price * rate, nativePrice: quote.price, currency: quote.currency, changePct: quote.changePct, at: quote.at });
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Cours indisponible');
    } finally {
      setQuoteLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Saisir un nom.');
    if (mode === 'search') {
      if (!selected) return setError('Choisir un titre dans les résultats de recherche.');
      const duplicate = assets.find((a) => a.id !== existing?.id && a.provider === selected.provider && a.symbol === selected.symbol);
      if (duplicate) return setError(`Ce titre est déjà enregistré sous le nom « ${duplicate.name} ».`);
    }
    const price = manualPrice.trim() ? parseAmount(manualPrice) : null;
    if (mode === 'manual' && manualPrice.trim() && (price === null || price <= 0)) return setError('Saisir un cours valide.');

    const manualPrices = [...(existing?.manualPrices ?? [])];
    if (mode === 'manual' && price) {
      const i = manualPrices.findIndex(([d]) => d === today());
      if (i >= 0) manualPrices[i] = [today(), price];
      else manualPrices.push([today(), price]);
    }

    const asset = saveAsset({
      id: existing?.id,
      createdAt: existing?.createdAt,
      name: name.trim(),
      assetClass,
      isin: isin.trim() || undefined,
      provider: mode === 'search' && selected ? selected.provider : 'manual',
      symbol: mode === 'search' && selected ? selected.symbol : undefined,
      currency: mode === 'search' ? (preview?.currency ?? existing?.currency ?? 'EUR') : 'EUR',
      lastPrice: mode === 'search' ? (preview?.price ?? existing?.lastPrice) : undefined,
      lastPriceAt: mode === 'search' ? (preview?.at ?? existing?.lastPriceAt) : undefined,
      changePct: mode === 'search' ? (preview?.changePct ?? existing?.changePct) : undefined,
      manualPrices: manualPrices.length ? manualPrices : undefined,
    });
    notifyDone(existing ? 'Titre modifié' : 'Titre ajouté');
    onDone(asset);
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Segmented<Mode>
        label="Mode de suivi du cours"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        className="w-full"
        options={[
          { value: 'search', label: 'Cours automatique' },
          { value: 'manual', label: 'Saisie manuelle' },
        ]}
      />

      {mode === 'search' ? (
        <>
          <Field label="Rechercher" hint="Nom, symbole (CW8.PA, AAPL) ou code ISIN.">
            {(id, describedBy) => (
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                <Input
                  id={id}
                  data-enter="ignore"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex. MSCI World, TotalEnergies, Bitcoin…"
                  aria-describedby={describedBy}
                  className="pl-9"
                  data-autofocus={existing ? undefined : ''}
                />
                {searching && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />}
              </div>
            )}
          </Field>

          {searchError && <p className="text-sm text-bad">{searchError}</p>}

          {results.length > 0 && (
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-1" aria-label="Résultats">
              {results.map((r) => {
                const isSelected = selected?.provider === r.provider && selected.symbol === r.symbol;
                return (
                  <li key={`${r.provider}:${r.symbol}`}>
                    <button
                      type="button"
                      onClick={() => void choose(r)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-brand-soft ring-1 ring-brand/40' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {r.provider === 'coingecko' ? r.exchange : r.symbol}
                          {r.provider === 'yahoo' && r.exchange ? ` · ${r.exchange}` : ''}
                        </span>
                      </span>
                      {r.type && <Badge>{r.type}</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected && (
            <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
              <p className="text-xs text-ink-3">Titre suivi</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-ink">{selected.name}</span>
                <span className="font-mono text-[11px] text-ink-3">{selected.symbol}</span>
              </p>
              {quoteLoading && (
                <p className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                  <Spinner className="size-3" /> Récupération du cours…
                </p>
              )}
              {quoteError && <p className="mt-2 text-xs text-bad">{quoteError}</p>}
              {preview && (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="money tnum font-semibold text-ink">{formatPrice(preview.price)}</span>
                  {preview.currency !== 'EUR' && (
                    <span className="tnum text-xs text-ink-3">
                      ({preview.nativePrice.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} {preview.currency})
                    </span>
                  )}
                  {preview.changePct !== null && (
                    <span className={cn('tnum text-xs', preview.changePct >= 0 ? 'text-good' : 'text-bad')}>
                      {formatPct(preview.changePct / 100, { sign: true })} sur la journée
                    </span>
                  )}
                  <span className="text-xs text-ink-3">· {formatDateTime(preview.at)}</span>
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <Field label="Cours actuel (facultatif)" hint="À mettre à jour de temps en temps depuis la page Investissements.">
          {(id, describedBy) => (
            <AmountInput id={id} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} aria-describedby={describedBy} placeholder="0,00" />
          )}
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Nom">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex. Fonds euros Linxea" />}
        </Field>
        <Field label="Catégorie">
          {(id) => (
            <Select id={id} value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {ASSET_CLASS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {ASSET_CLASSES[c].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Code ISIN (facultatif)">
        {(id) => <Input id={id} value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())} maxLength={12} className="font-mono text-[13px]" placeholder="FR0000000000" />}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
