import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const ids = ['haru','naru','sodam','iden','arin','rumi','onyu','bora','sion'];
const scenes = ['forest','map','room','village','beach','ascending-map'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pngHashes = ['dd2f59800239c14515e9532ae0dc2cf7b1a59d7f0a374095e47aadc7f10d07c3','a597e310a2bdc1f9dc225f22c3c39a65d17714627662370e6e96eb7e7aaa9136','5dc67f5dcbe4ef3a6e7b4cb41c5a4a525386c2bc80d4ae633e2ae2c33461b0a5','5b6c034de83936ff08e305899b220653047c3bcf807a070238324d717c0bd8a2','1a7cedba920fb0a6adec027ec77a43a1348cfb52ceb868a11b791b0a8d6cfea0','8b727caf27e0042616ad29a3ee81b49c82df75ace372ffa680e6ade7fac1568c','619265bec41683072f774b25eb337a72469d454f71455fa4a3ae401f57837c22','b3340b6a01a998ae175c99fdc89e52a9f2295bb66781cedae153060921610fac','12f105ab5f3a9835c35cce039ce55b83bfed00a6d6649b48ad7798cc7c106f65'];
const webpHashes = ['825f72e1be11da20b4ab503c398a0b5418be333d8afa41a813d120230f9c7862','4849a5751bdab6caff9d189f31c9d630089704dd0f84e16491071e71ae0a3079','2f9812979c27f4fa8f473d0bb66d78766d5c072e8d715ebd65c81bb339de7a9c','4b3a4901616ea3d19c6322992bd077b8447868639d9f98f370a283c426c0301d','986f15f61b2d895e6fb720cddc9bdf1f9a0e449ba33751fae7e5b90613958ad6','c6e034cf0abeffb28c4d0d70dd2fd0bcd34621bffb508ead503c21a0255cd520'];

test('emitted files preserve every decoded source byte with nine PNGs and six WebPs', async () => {
  const root = new URL('../frontend/public/game/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal((await readdir(new URL('characters/', root))).length, 9);
  assert.equal((await readdir(new URL('scenes/', root))).length, 6);
  for (const [names, folder, ext, hashes] of [[ids,'characters','png',pngHashes],[scenes,'scenes','webp',webpHashes]]) {
    for (const [i,id] of names.entries()) {
      const path = `${folder}/${id}.${ext}`;
      const bytes = await readFile(new URL(path, root));
      assert.equal(sha(bytes), hashes[i], path);
      assert.equal(manifest.assets.find(asset => asset.path === path)?.sha256, hashes[i]);
    }
  }
  assert.equal(manifest.assets.length, 15);
  assert.doesNotMatch(JSON.stringify(manifest), /\/Users\/|DAYS|answers|explanation|<script/);
});

test('extracts only whitelisted image data and never runs reference scripts', async () => {
  const { extractGameAssets } = await import('./extract-game-assets.mjs');
  const dir = await mkdtemp(join(tmpdir(),'hanbit-art-test-'));
  try {
    const pngs = ids.map((_,i) => Buffer.from([137,80,78,71,13,10,26,10,i]));
    const webps = scenes.map((_,i) => Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.from([i])]));
    const art = `const ART = [${pngs.map(b => `'data:image/png;base64,${b.toString('base64')}'`).join(',')}];`;
    const css = scenes.map((id,i) => `--${id}-image:url('data:image/webp;base64,${webps[i].toString('base64')}');`).join('');
    const game = join(dir,'game.html'), equipment = join(dir,'equipment.html'), out = join(dir,'out');
    await writeFile(game, `<style>:root{${css}}</style><script>${art}throw new Error('EXECUTED');const DAYS = ['secret-answer'];</script>`);
    await writeFile(equipment, `<script>${art}throw new Error('EXECUTED');</script>`);
    await extractGameAssets({ game, equipment, out });
    assert.deepEqual(await readFile(join(out,'characters','haru.png')), pngs[0]);
    assert.deepEqual(await readFile(join(out,'scenes','ascending-map.webp')), webps[5]);
    const manifest = await readFile(join(out,'manifest.json'),'utf8');
    assert.doesNotMatch(manifest, /secret-answer|EXECUTED|<script|hanbit-art-test-/);
    await writeFile(equipment, art.replace(pngs[0].toString('base64'),pngs[1].toString('base64')));
    await assert.rejects(extractGameAssets({game,equipment,out}), /differ/i);
    await writeFile(equipment, art);
    await writeFile(game, art.replace('data:image/png;', 'data:image/svg+xml;') + css);
    await assert.rejects(extractGameAssets({game,equipment,out}), /PNG/i);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
