/**
 * Publica o LindaurIA no GitHub Pages (branch gh-pages), sem precisar de GitHub Actions.
 *   npm run publicar
 * Endereço: https://<usuario>.github.io/<repositorio>/
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const remote = out('git remote get-url origin'); // https://github.com/usuario/repo.git
const repo = remote.replace(/\.git$/, '').split('/').pop();
const base = `/${repo}/`;
const dist = join('apps', 'patient', 'dist');

console.log(`\n▶ Testes`);
run('npx vitest run');

console.log(`\n▶ Gerando o app para ${base}`);
run('npm --prefix apps/patient run build', { env: { ...process.env, BASE_PATH: base } });
copyFileSync(join(dist, 'index.html'), join(dist, '404.html')); // qualquer endereço abre o app
writeFileSync(join(dist, '.nojekyll'), '');

console.log('\n▶ Enviando para a branch gh-pages');
const git = (c) => run(`git ${c}`, { cwd: dist });
if (existsSync(join(dist, '.git'))) rmSync(join(dist, '.git'), { recursive: true, force: true });
git('init -q -b gh-pages');
git(`config user.name "${out('git config user.name') || 'LindaurIA'}"`);
git(`config user.email "${out('git config user.email') || 'lindauria@users.noreply.github.com'}"`);
git('add -A');
git(`commit -q -m "Publicação ${new Date().toISOString()}"`);
git(`push -q -f ${remote} gh-pages`);
rmSync(join(dist, '.git'), { recursive: true, force: true });

const user = remote.split('/').slice(-2, -1)[0];
console.log(`\n✔ Publicado! Em 1–2 minutos estará em https://${user}.github.io${base}\n`);
