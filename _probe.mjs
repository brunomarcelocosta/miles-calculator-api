import { writeFileSync } from 'node:fs';

const lines = [];

for (const name of ['prisma', '@prisma/client']) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
  });
  const body = await res.json();

  lines.push(`== ${name} ==`);
  lines.push(`dist-tags: ${JSON.stringify(body['dist-tags'])}`);

  const stable7 = Object.keys(body.versions)
    .filter((version) => version.startsWith('7.') && !version.includes('-'))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      return pa[1] - pb[1] || pa[2] - pb[2];
    });

  lines.push(`ultimas 7.x estaveis: ${stable7.slice(-5).join(', ')}`);
  lines.push('');
}

writeFileSync(new URL('./_probe.txt', import.meta.url), lines.join('\n'), 'utf8');
