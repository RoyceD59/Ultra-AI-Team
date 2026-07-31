/**
 * UC Impact Admin — ProjectHub page
 *
 * Displays live auto-calculated impact stats and lets the team add
 * manual baseline offsets to account for pre-system sales, offline orders, etc.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Leaf, Droplets, Trash2, Users, RefreshCw, Save, Info } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ImpactData {
  totalUsers:      number;
  litresFiltered:  number;
  plasticsAvoided: number;
  autoStats: {
    totalUsers:     number;
    litresFiltered: number;
  };
  override: {
    litresOffset:  number;
    usersOffset:   number;
    lastUpdatedBy: string;
    lastUpdatedAt: string;
  };
  lastUpdated: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function StatCard({
  icon: Icon, color, label, auto, total, offset,
}: {
  icon: React.ElementType; color: string; label: string;
  auto: number; total: number; offset: number;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`w-4 h-4 ${color}`} />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-bold text-foreground">{fmt(total)}</div>
        <p className="text-xs text-muted-foreground">
          Auto: {fmt(auto)}
          {offset !== 0 && (
            <span className="ml-1 text-amber-600 font-medium">
              {offset > 0 ? '+' : ''}{fmt(offset)} manual
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default function ImpactPage() {
  const [data,    setData]    = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const [litresOffset, setLitresOffset] = useState('');
  const [usersOffset,  setUsersOffset]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/api/uc/impact`);
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json() as ImpactData;
      setData(d);
      // Seed form fields from current override
      setLitresOffset(String(d.override.litresOffset));
      setUsersOffset(String(d.override.usersOffset));
    } catch (e) {
      setError('Failed to load impact data. Is the API server running?');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const litres = parseFloat(litresOffset) || 0;
      const users  = parseFloat(usersOffset)  || 0;

      if (!isFinite(litres) || !isFinite(users)) {
        setError('Offsets must be valid numbers.');
        return;
      }

      const res = await fetch(`${BASE}/api/uc/impact/override`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ litresOffset: litres, usersOffset: users, updatedBy: 'admin' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as Record<string, unknown>)) as { error?: string };
        throw new Error(err.error ?? String(res.status));
      }
      setSuccess('Offsets saved. Refreshing stats…');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 animate-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Leaf className="w-7 h-7 text-green-500" />
            UC Impact Metrics
          </h1>
          <p className="text-muted-foreground mt-1">
            Auto-calculated from completed orders. Add manual offsets to include pre-system or offline sales.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Live Stats */}
      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={Users}    color="text-blue-500"   label="Happy Users"
            auto={data.autoStats.totalUsers}     total={data.totalUsers}
            offset={data.override.usersOffset}
          />
          <StatCard
            icon={Droplets} color="text-emerald-500" label="Litres Filtered"
            auto={data.autoStats.litresFiltered} total={data.litresFiltered}
            offset={data.override.litresOffset}
          />
          <StatCard
            icon={Trash2}   color="text-orange-500"  label="500 ml Plastic Bottles Avoided"
            auto={data.autoStats.litresFiltered * 2} total={data.plasticsAvoided}
            offset={data.override.litresOffset * 2}
          />
        </div>
      ) : null}

      {data && (
        <p className="text-xs text-muted-foreground -mt-4">
          Last calculated: {new Date(data.lastUpdated).toLocaleString()}
          {data.override.lastUpdatedAt && (
            <> · Offsets last set: {new Date(data.override.lastUpdatedAt).toLocaleString()} by {data.override.lastUpdatedBy}</>
          )}
        </p>
      )}

      {/* Manual Offset Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            Manual Baseline Adjustments
          </CardTitle>
          <CardDescription>
            These values are added on top of the auto-calculated figures. Use them to include
            offline sales, pre-system historical data, or bulk orders not yet in the database.
            Negative values are allowed to correct over-counts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="litresOffset" className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-emerald-500" />
                Additional Litres Filtered
              </Label>
              <Input
                id="litresOffset"
                type="number"
                step="1"
                value={litresOffset}
                onChange={e => setLitresOffset(e.target.value)}
                placeholder="e.g. 250000"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Plastic bottles avoided adjusts automatically (+{litresOffset ? (parseFloat(litresOffset) * 2).toLocaleString() : 0}).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usersOffset" className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Additional Users
              </Label>
              <Input
                id="usersOffset"
                type="number"
                step="1"
                value={usersOffset}
                onChange={e => setUsersOffset(e.target.value)}
                placeholder="e.g. 500"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Customers not yet registered in the app (e.g. retail / distributor sales).
              </p>
            </div>
          </div>

          {error   && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save adjustments'}
          </Button>
        </CardContent>
      </Card>

      {/* How it's calculated */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">How litres are calculated</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>For each completed or processing order item (excluding shower / skin filters):</p>
            <p className="font-mono text-xs bg-muted rounded px-3 py-2">litres += quantity × product_litre_capacity</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              {[
                ['Bottle filters', '150 L'],
                ['Survivor Straw', '400 L'],
                ['EcoSmart Elite', '400 L'],
                ['Electric Pitcher', '400 L'],
                ['Sweet Home faucet', '1,750 L'],
                ['Counter RO', '1,500 L'],
                ['RO Home System', '10,000 L'],
                ['Aqua Stream 1200', '50,000 L'],
              ].map(([name, cap]) => (
                <div key={name} className="text-xs border rounded p-2">
                  <div className="font-medium text-foreground">{name}</div>
                  <div className="text-muted-foreground">{cap} / unit</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
