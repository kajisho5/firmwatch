// S7 書き出し
import { useEffect, useState } from 'react';
import { api, type Gear, type UpdateLog } from '../api';
import { Screen, Back, SectionTitle, Button, ErrorNote, List } from '../ui';
import { GEAR_COLUMNS, LOG_COLUMNS, toCsv, toXlsx, saveFiles } from '../exporter';

export function Export() {
  const [gear, setGear] = useState<Gear[] | null>(null);
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx');
  const [range, setRange] = useState<string>('all');
  const [tables, setTables] = useState({ gear: true, logs: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<{ gear: Gear[] }>('/api/gear'), api<{ updates: UpdateLog[] }>('/api/updates')])
      .then(([a, b]) => { setGear(a.gear); setLogs(b.updates); }).catch(e => setErr(e.message));
  }, []);

  const makers = [...new Set((gear ?? []).map(g => g.maker))];
  const options: [string, string, number][] = [
    ['all', 'すべて', gear?.length ?? 0],
    ...makers.map(m => [`maker:${m}`, `${m} だけ`, (gear ?? []).filter(g => g.maker === m).length] as [string, string, number]),
    ['old', '確認が要る更新があるもの', (gear ?? []).filter(g => g.state === 'old').length],
  ];
  const pickGear = (gear ?? []).filter(g => range === 'all' || (range === 'old' ? g.state === 'old' : g.maker === range.slice(6)));
  const ids = new Set(pickGear.map(g => g.id));
  const pickLogs = logs.filter(u => ids.has(u.gear_id));

  const run = async () => {
    setBusy(true); setErr(null);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    try {
      if (fmt === 'xlsx') {
        const sheets: { name: string; header: string[]; rows: string[][] }[] = [];
        if (tables.gear) sheets.push({ name: '機材の一覧', header: GEAR_COLUMNS.map(c => c[0]), rows: pickGear.map(g => GEAR_COLUMNS.map(c => c[1](g))) });
        if (tables.logs) sheets.push({ name: '更新の記録', header: LOG_COLUMNS.map(c => c[0]), rows: pickLogs.map(u => LOG_COLUMNS.map(c => c[1](u))) });
        await saveFiles([{ blob: await toXlsx(sheets), name: `firmwatch_${stamp}.xlsx` }]);
      } else {
        const files: { blob: Blob; name: string }[] = [];
        if (tables.gear) files.push({ blob: new Blob([toCsv(pickGear, GEAR_COLUMNS)], { type: 'text/csv' }), name: `firmwatch_gear_${stamp}.csv` });
        if (tables.logs) files.push({ blob: new Blob([toCsv(pickLogs, LOG_COLUMNS)], { type: 'text/csv' }), name: `firmwatch_updates_${stamp}.csv` });
        await saveFiles(files);
      }
    } catch (e: any) { setErr(e.message || '書き出せませんでした。'); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Back label="機材" to="/gear" />
      <h1 className="px-5 pt-2 text-[28px] font-bold">書き出し</h1>
      <ErrorNote text={err} />
      <SectionTitle>ファイルの形式</SectionTitle>
      <div className="mx-5 flex overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-white" role="radiogroup">
        {([['xlsx', 'Excel'], ['csv', 'CSV']] as const).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={fmt === k} onClick={() => setFmt(k)} className={`h-[44px] flex-1 text-[16px] font-semibold ${fmt === k ? 'bg-ink text-white' : 'text-ink'}`}>{l}</button>
        ))}
      </div>

      <SectionTitle>どの機材を</SectionTitle>
      <List>
        {options.map(([k, label, n]) => (
          <label key={k} className="flex min-h-[51px] items-center gap-3 bg-panel px-5">
            <input type="radio" name="range" checked={range === k} onChange={() => setRange(k)} className="h-[18px] w-[18px] accent-black" />
            <span className="flex-1 text-[15px]">{label}</span>
            <span className="text-[14px] text-sub">{n}台</span>
          </label>
        ))}
      </List>

      <SectionTitle>入れる表</SectionTitle>
      <List>
        {([['gear', '機材の一覧', '管理番号、機種、今と最新のバージョン、購入日など'], ['logs', '更新の記録', 'いつ、どの台を、どのバージョンにしたか、誰が']] as const).map(([k, l, d]) => (
          <label key={k} className="flex min-h-[61px] items-center gap-3 bg-panel px-5 py-2">
            <input type="checkbox" checked={tables[k]} onChange={e => setTables(t => ({ ...t, [k]: e.target.checked }))} className="h-[20px] w-[20px] accent-black" />
            <span><span className="block text-[15px] font-semibold">{l}</span><span className="block text-[12.5px] text-sub">{d}</span></span>
          </label>
        ))}
      </List>
      <p className="px-5 pt-4 text-[13px] leading-[1.6] text-sub">Excel は1つのファイルに表を2枚入れます。<br />CSV は表ごとに分け、Excel で文字化けしない形にします。</p>
      <div className="px-5 pt-5"><Button disabled={busy || !gear || (!tables.gear && !tables.logs) || pickGear.length === 0} onClick={run}>書き出して保存する</Button></div>
    </Screen>
  );
}
