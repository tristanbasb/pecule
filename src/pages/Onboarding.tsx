import { ArrowRight, Sparkles, Upload, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AccountDialog } from '../components/dialogs/AccountDialog';
import { Guilloche, Logo } from '../components/Guilloche';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/fields';
import { Spinner } from '../components/ui/misc';
import { api } from '../lib/api';
import { buildDemoData } from '../lib/demo';
import { looksLikePeculeData, sanitizeData } from '../lib/defaults';
import { replaceAllData, updateSettings } from '../store/actions';

export function Onboarding() {
  const [name, setName] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const finish = () => updateSettings({ onboarded: true, displayName: name.trim() || undefined });

  async function startDemo() {
    setLoadingDemo(true);
    try {
      const data = await buildDemoData(async (symbol) => (await api.history('yahoo', symbol)).points);
      replaceAllData({ ...data, settings: { onboarded: true, displayName: name.trim() || undefined } });
      toast.success('Données de démonstration chargées', {
        description: 'Tout effacer depuis Réglages pour repartir de zéro.',
      });
    } finally {
      setLoadingDemo(false);
    }
  }

  async function restore(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const payload = parsed?.data && looksLikePeculeData(parsed.data) ? parsed.data : parsed;
      if (!looksLikePeculeData(payload)) throw new Error('Ce fichier ne ressemble pas à une sauvegarde de Pécule.');
      replaceAllData({ ...sanitizeData(payload), settings: { ...sanitizeData(payload).settings, onboarded: true } });
      toast.success('Sauvegarde restaurée');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fichier illisible');
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <Guilloche className="pointer-events-none absolute -right-40 -top-40 size-[640px] text-brass opacity-25 max-sm:-right-72" />
      <div className="relative w-full max-w-xl">
        <Logo />
        <h1 className="display mt-10 text-[40px] leading-[1.05] text-ink sm:text-[52px]">
          Budget et placements,
          <br />
          au même endroit.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
          Suivre ses dépenses mois par mois, voir grandir son patrimoine. Les données restent sur cet ordinateur, dans le
          dossier de l'application.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <Field label="Prénom ou surnom (facultatif)" hint="Affiché sur l'accueil.">
            {(id, describedBy) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-describedby={describedBy} autoComplete="given-name" />
            )}
          </Field>

          <div className="mt-6 grid gap-3">
            <Button variant="primary" size="lg" className="justify-between" onClick={() => setAccountOpen(true)}>
              <span className="flex items-center gap-2">
                <WalletCards /> Créer un premier compte
              </span>
              <ArrowRight />
            </Button>
            <Button size="lg" className="justify-between" onClick={() => void startDemo()} disabled={loadingDemo}>
              <span className="flex items-center gap-2">
                {loadingDemo ? <Spinner /> : <Sparkles />} Explorer avec des données de démonstration
              </span>
              <ArrowRight />
            </Button>
            <label className="flex h-11 cursor-pointer items-center justify-between rounded-lg px-5 text-[15px] font-medium text-ink-2 transition-colors hover:bg-surface-3/70 hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <span className="flex items-center gap-2">
                <Upload className="size-4" /> Restaurer une sauvegarde
              </span>
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
        </div>
      </div>

      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} onSaved={finish} />
    </div>
  );
}
