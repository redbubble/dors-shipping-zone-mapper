import { spawn } from 'child_process'
import fs from 'node:fs'

async function runProcess(cmd, args) {
  const child = spawn(cmd, args);
  let out = "";
  let err = "";
  for await (const chunk of child.stdout) out += chunk;
  for await (const chunk of child.stderr) err += chunk;
  const exitCode = await new Promise((resolve) => {
    child.on('close', resolve);
  });
  if (exitCode) throw new Error(`subprocess error exit ${exitCode}, ${err}`);
  return out;
}

const fedexPdfs = fs.readdirSync('./fedex-zones-pdf/')
for (const pdf of fedexPdfs) {
  if (!pdf.endsWith('.pdf')) continue;

  const nameWithoutFile = pdf.replace(/\.pdf$/, '')

  await runProcess(
    `pdftotext`,
    ['-tsv', '-nopgbrk', `./fedex-zones-pdf/${pdf}`, `./fedex-zones-tsv/${nameWithoutFile}.tsv`],
  );

  const info = await runProcess(`git`, ['log', '-n', '1', '--pretty=%H %cI', `./fedex-zones-pdf/${pdf}`]);
  const parts = info.trim().split(' ');
  if (parts.length !== 2) throw new Error(`pdf ${pdf} commit info invalid`);

  const [hash, date] = parts;
  if (!hash || !date) throw new Error(`pdf ${pdf} commit info invalid`);

  fs.writeFileSync(
    `./fedex-zones-tsv/${nameWithoutFile}.meta.json`,
    JSON.stringify({
      description: "Fedex rate tools PDF https://www.fedex.com/ratetools/RateToolsMain.do",
      file: pdf,
      parsedAt: new Date().toISOString(),
      repo: "dors-shipping-zone-mapper",
      commitId: hash,
      committedAt: date,
    }, null, 2),
  );
}
