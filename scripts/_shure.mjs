import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--headless=new'] });
const p = await b.newPage({ userAgent: 'Mozilla/5.0 (compatible; FIRMWATCH/0.1; +https://github.com/kajisho5/firmwatch)', locale: 'en-US' });
const all = [];
for (let cur = 1; cur <= 21; cur++) {
  await p.goto(`https://www.shure.com/en-US/support/downloads/software-firmware-archive?size=n_100_n&current=n_${cur}_n&sort-field=versionreleasedate&sort-direction=desc`, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2000);
  const t = await p.evaluate(() => document.body.innerText);
  all.push(t);
  await p.waitForTimeout(1500);
}
writeFileSync('/tmp/shure-pages.json', JSON.stringify(all));
await b.close();
