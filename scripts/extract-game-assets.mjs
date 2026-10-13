import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const characters = ['haru','naru','sodam','iden','arin','rumi','onyu','bora','sion'];
const scenes = ['forest','map','room','village','beach','ascending-map'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function decode(uri, type) {
  const match = new RegExp(`^data:image/${type};base64,([A-Za-z0-9+/]+={0,2})$`).exec(uri);
  if (!match) throw new Error(`Expected a whitelisted ${type.toUpperCase()} base64 data URI`);
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.toString('base64') !== match[1]) throw new Error('Noncanonical base64 image');
  const valid = type === 'png'
    ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw new Error(`Invalid ${type.toUpperCase()} image signature`);
  return bytes;
}

function characterImages(html) {
  // Parse the literal array as data. Never execute any reference JavaScript.
  const arrays = [...html.matchAll(/\bconst\s+ART\s*=\s*\[([^\]]*)\]\s*;/g)];
  if (arrays.length !== 1) throw new Error('Expected one ART array containing nine PNGs');
  const literals = [...arrays[0][1].matchAll(/(['"])(data:image\/[^'"\s]+)\1/g)];
  const remainder = arrays[0][1].replace(/(['"])(data:image\/[^'"\s]+)\1/g, '').replace(/[\s,]/g,'');
  if (literals.length !== 9 || remainder) throw new Error('Expected nine literal PNGs in ART');
  return literals.map(match => decode(match[2],'png'));
}

export async function extractGameAssets({game, equipment, out}) {
  const [gameSource, equipmentSource] = await Promise.all([readFile(game,'utf8'),readFile(equipment,'utf8')]);
  const gameCharacters = characterImages(gameSource), equipmentCharacters = characterImages(equipmentSource);
  if (gameCharacters.some((bytes,i) => !bytes.equals(equipmentCharacters[i]))) {
    throw new Error('Character PNG bytes differ between source references');
  }
  const files = characters.map((id,i) => ({id,path:`characters/${id}.png`,type:'image/png',bytes:gameCharacters[i],source:'game+equipment',selector:`ART[${i}]`}));
  for (const id of scenes) {
    const pattern = new RegExp(`--${id}-image\\s*:\\s*url\\(\\s*(['"])(data:image/[^'"\\s]+)\\1\\s*\\)`, 'g');
    const matches = [...gameSource.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected one WebP for --${id}-image`);
    files.push({id,path:`scenes/${id}.webp`,type:'image/webp',bytes:decode(matches[0][2],'webp'),source:'game',selector:`--${id}-image`});
  }
  // Validate everything before writing; filenames come solely from the whitelist.
  for (const file of files) {
    const path = join(out,file.path);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,file.bytes);
  }
  const manifest = {
    version:'game-v1',
    sources:{game:{label:'hanbit-ox.html',sha256:sha256(gameSource)},equipment:{label:'equipment-design-review.html',sha256:sha256(equipmentSource)}},
    assets:files.map(({bytes,...metadata}) => ({...metadata,byteLength:bytes.length,sha256:sha256(bytes)})),
  };
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i=0;i<args.length;i+=2) {
    const name = args[i].slice(2);
    if (!['game','equipment','out'].includes(name) || !args[i+1]) throw new Error('Usage: --game HTML --equipment HTML --out DIRECTORY');
    options[name] = args[i+1];
  }
  if (!options.game || !options.equipment || !options.out) throw new Error('Usage: --game HTML --equipment HTML --out DIRECTORY');
  const manifest = await extractGameAssets(options);
  console.log(`Extracted ${manifest.assets.length} original images (9 PNG, 6 WebP).`);
}
