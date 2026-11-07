// S2 機材
import { useEffect, useState } from 'react';
import { api, cache, type Gear } from '../api';
import { Screen, Header, Lamp, Empty, ErrorNote, SectionTitle, List, Chevron, lampOf, stateText } from '../ui';
import { go } from '../router';

interface Group { key: string; maker: string; model: string; modelId: number | null; units: Gear[] }

export function groupGear(gear: Gear[]) {
  const byMaker = new Map<string, Group[]>();
  const byModel = new Map<string, Group>();
  for (const g of gear) {
    const key = g.model_id != null ? `m${g.model_id}` : `c${g.id}`;
    let grp = byModel.get(key);
    if (!grp) {
      grp = { key, maker: g.maker, model: g.model, modelId: g.model_id, units: [] };
      byModel.set(key, grp);
      byMaker.set(g.maker, [...(byMaker.get(g.maker) ?? []), grp]);
    }
    grp.units.push(g);
  }
  return [...byMaker.entries()];
}

function groupLine(grp: Group): { lamp: 'red' | 'green' | 'off'; text: string; alert: boolean } {
  const old = grp.units.filter(u => u.state === 'old');
  const first = grp.units[0];
  if (grp.units.length === 1) return { lamp: lampOf(first.state), text: stateText(first), alert: first.state === 'old' };
  if (old.length) return { lamp: 'red', text: `${old.length}台が古いバージョンのまま。最新は ${first.latest?.version}`, alert: true };
  if (grp.units.every(u => u.state === 'ok')) return { lamp: 'green', text: `すべて最新の ${first.latest?.version}`, alert: false };
  return { lamp: 'off', text: stateText(grp.units.find(u => u.state !== 'ok') ?? first), alert: false };
}

export function GearList() {
  const [gear, setGear] = useState<Gear[] | null>(cache.get('gear'));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ gear: Gear[] }>('/api/gear').then(r => { setGear(r.gear); cache.set('gear', r.gear); }).catch(e => setErr(e.message));
  }, []);

  const old = gear?.filter(g => g.state === 'old').length ?? 0;
  const groups = groupGear(gear ?? []);

  return (
    <Screen tab={1}>
      <Header title="機材" right={<>
        <button aria-label="書き出し" onClick={() => go('/export')} disabled={!gear?.length} className="flex h-[36px] w-[44px] items-center justify-center rounded-[6px] border border-rule bg-white disabled:opacity-40">
          <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden><path d="M8 1v12M4 5l4-4 4 4M3 9H1v10h14V9h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button aria-label="機材を追加" onClick={() => go('/add')} className="flex h-[36px] w-[44px] items-center justify-center rounded-[6px] bg-ink text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M1 8h14M8 1v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </>} />
      <ErrorNote text={err} />
      {gear && gear.length > 0 && (
        <p className="px-5 pt-2 text-[14px] text-sub">{old ? `${gear.length}台のうち、${old}台に確認が要る更新があります。` : `${gear.length}台を見張っています。`}</p>
      )}
      {gear && gear.length === 0 && (
        <Empty title="まだ機材がありません">右上の「＋」から、持っている機材を追加してください。12,000以上の機種から選べます。</Empty>
      )}
      {groups.map(([maker, grps]) => (
        <section key={maker}>
          <SectionTitle>{maker}</SectionTitle>
          <List>
            {grps.map(grp => {
              const l = groupLine(grp);
              return (
                <button key={grp.key} onClick={() => go(grp.modelId != null ? `/models/${grp.modelId}` : `/gear/${grp.units[0].id}`)}
                  className="flex min-h-[63px] w-full items-center gap-4 bg-panel px-5 py-2.5 text-left active:bg-white">
                  <Lamp state={l.lamp} quiet={!l.alert} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{grp.model}{grp.units.length > 1 ? `（${grp.units.length}台）` : grp.units[0].asset_no ? `　${grp.units[0].asset_no}` : ''}</span>
                    <span className={`block text-[13px] ${l.alert ? 'font-medium text-tally' : 'text-sub'}`}>{l.text}</span>
                  </span>
                  <Chevron />
                </button>
              );
            })}
          </List>
        </section>
      ))}
    </Screen>
  );
}
