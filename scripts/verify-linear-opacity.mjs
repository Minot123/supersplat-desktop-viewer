import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const upstream = path.join(root, 'scratch/supersplat-upstream-3.8.0');
register(pathToFileURL(path.join(upstream, 'test/ts-resolve.mjs')));
const fromBuild = (name) => import(pathToFileURL(path.join(upstream, 'test/.build/src', name)));
const { EditorSplatResource } = await fromBuild('editor-splat-resource.js');
const { ColorGrade, createGradeTerms } = await fromBuild('color-grade.js');
const { FloatPacking } = await import(pathToFileURL(path.join(upstream, 'node_modules/playcanvas/build/playcanvas.mjs')));
const { writeSplatFile } = await fromBuild('splat-serialize.js');
const { BlobReadSource, loadSplatSource } = await fromBuild('io/index.js');
const { MemoryFileSystem, createChunkDataPool } = await import(pathToFileURL(path.join(upstream, 'node_modules/@playcanvas/splat-transform/dist/index.mjs')));

const failures = [];
const check = async (name, run) => {
  try { await run(); console.log(`OK ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
};
const close = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

await check('GPU texture receives linear alpha once, including zero and unity', () => {
  const alpha = [0, 0.001, 0.1, 0.5, 0.9, 1, 1.25];
  const geometry = new Float32Array(alpha.length * 8);
  alpha.forEach((v, i) => { geometry[i * 8 + 7] = v; });
  const packed = new Uint16Array(alpha.length * 4);
  EditorSplatResource.prototype.fillColor.call({}, packed, geometry, new Float32Array(alpha.length * 3), 3, 0, alpha.length);
  alpha.forEach((v, i) => assert.equal(packed[i * 4 + 3], FloatPacking.float2Half(Math.fround(v))));
});

await check('identity grade does not change alpha', () => {
  const grade = new ColorGrade(createGradeTerms());
  for (const alpha of [0, 0.001, 0.1, 0.5, 1, 1.25]) {
    close(grade.applyOpacity(alpha), alpha, 1e-12);
    close(grade.applyAlpha(alpha), alpha, 1e-12);
  }
});

await check('exported transparency matches viewport multiplication', () => {
  const terms = createGradeTerms();
  terms.transparency = 0.5;
  const grade = new ColorGrade(terms);
  for (const [input, expected] of [[0, 0], [0.1, 0.05], [0.5, 0.25], [1, 0.5], [1.25, 0.625]]) {
    close(grade.applyOpacity(input), expected, 1e-12);
    close(grade.applyAlpha(input), expected, 1e-12);
  }
});

const readPly = async (data) => {
  const fs = { createSource: async () => new BlobReadSource(new Blob([data])) };
  return (await loadSplatSource('fixture.ply', fs, true)).source;
};
const fixture = async (alpha, linear = false) => {
  const names = ['x', 'y', 'z', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'scale_0', 'scale_1', 'scale_2', linear ? 'opacity_linear' : 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
  const header = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${alpha.length}\n${names.map(n => `property float ${n}`).join('\n')}\nend_header\n`);
  const data = Buffer.alloc(alpha.length * names.length * 4);
  alpha.forEach((a, i) => {
    const row = [i, 0, 0, 1, 0, 0, 0, -2, -2, -2, linear ? a : Math.log(a / (1 - a)), 0, 0, 0];
    row.forEach((v, j) => data.writeFloatLE(v, (i * names.length + j) * 4));
  });
  return readPly(Buffer.concat([header, data]));
};
const readAlpha = async (source) => {
  const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
  const data = pool.acquire('geometric', source.meta.layouts.geometric, source.meta.numGaussians);
  try {
    await source.read({ chunkIndex: 0, geometric: data });
    const values = new Float32Array(data.data);
    return Array.from({ length: source.meta.numGaussians }, (_, i) => values[i * 8 + 7]);
  } finally { data.release(); pool.destroy(); }
};
// CPU scene fixture at the serializer boundary: the reader, grade, filter,
// permutation and PLY writer are the real production implementations.
const exportPly = async (source, transparency = 1, minOpacity = 0, removeInvalid = false) => {
  const count = source.meta.numGaussians;
  const splat = {
    resource: { source, shBands: 0, model: source.meta.model },
    instances: {
      count, flags: new Uint8Array(count), sourceRow: Uint32Array.from({ length: count }, (_, i) => i),
      transformIndex: () => 0, colorIndex: () => 0
    },
    colorPalette: { size: 1, getEntry: (_, entry) => { Object.assign(entry, createGradeTerms(), { transparency }); } }
  };
  const fs = new MemoryFileSystem();
  await writeSplatFile([splat], { keepWorldTransform: true, minOpacity, removeInvalid }, 'ply', 'output.ply', {}, fs);
  return readPly(fs.results.get('output.ply'));
};

await check('PLY export filters on linear opacity, not sigmoid(alpha)', async () => {
  const source = await fixture([0.001, 0.1, 0.5, 1]);
  const reopened = await exportPly(source, 1, 0.2);
  try { assert.deepEqual(await readAlpha(reopened), [0.5, 1]); }
  finally { await reopened.close(); await source.close(); }
});

await check('graded PLY survives two save/reopen cycles without opacity drift', async () => {
  const source = await fixture([0, 0.1, 0.5, 1]);
  const first = await exportPly(source, 0.5);
  const second = await exportPly(first);
  try {
    for (const reopened of [first, second]) {
      const values = await readAlpha(reopened);
      [0, 0.05, 0.25, 0.5].forEach((v, i) => close(values[i], v, 1e-6));
    }
  } finally { await source.close(); await first.close(); await second.close(); }
});

await check('opacity above one is not silently clamped by the PLY writer', async () => {
  const source = await fixture([0.5, 0.75, 1]);
  const first = await exportPly(source, 2);
  const second = await exportPly(first);
  try {
    for (const reopened of [first, second]) {
      const values = await readAlpha(reopened);
      [1, 1.5, 2].forEach((v, i) => close(values[i], v, 1e-6));
    }
  } finally { await source.close(); await first.close(); await second.close(); }
});

await check('invalid linear opacity is removed without discarding valid endpoint logits', async () => {
  const linear = await fixture([0, 0.5, 1, Infinity, -Infinity, NaN], true);
  const logits = await fixture([0, 0.5, 1]);
  const first = await exportPly(linear, 1, 0, true);
  const second = await exportPly(logits, 1, 0, true);
  try {
    assert.deepEqual(await readAlpha(first), [0, 0.5, 1]);
    assert.deepEqual(await readAlpha(second), [0, 0.5, 1]);
  } finally { await linear.close(); await logits.close(); await first.close(); await second.close(); }
});

if (failures.length) throw new Error(`${failures.length} linear opacity regressions`);
