// بصمة محتوى أصول التطبيق المخزّنة في Service Worker.
//
// sw.js يخدم JS و CSS بأسلوب cache-first، فلا يصل أي تحديث لها إلا إذا تغيّر ملف sw.js
// نفسه (المتصفح يقارن بايتاته ليقرر تثبيت نسخة جديدة). كان ذلك يعتمد على تذكّر رفع
// CACHE_NAME يدوياً، ونُسي في PR #6 فبقي المستخدمون الحاليون على كود PR #5.
//
// الآن ASSETS_HASH في sw.js بصمة لمحتوى كل ملفات CORE_ASSETS، و tests/sw.test.js يفشل
// إذا تغيّر أي ملف ولم تُحدَّث البصمة. التحديث أمر واحد:  npm run sw:hash

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW_PATH = join(ROOT, 'sw.js');
const HASH_LINE = /const ASSETS_HASH = '([0-9a-f]*)';/;

export function readCoreAssets(swSource = readFileSync(SW_PATH, 'utf8')) {
    const block = swSource.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
    if (!block) throw new Error('CORE_ASSETS غير موجودة في sw.js');
    return (
        Array.from(block[1].matchAll(/'([^']+)'/g), m => m[1])
            // './' هو index.html نفسه — يُحسب مرة واحدة.
            .filter(path => path !== './')
    );
}

// نهايات الأسطر تُوحَّد قبل الحساب حتى لا تختلف البصمة بين نسخة Windows (CRLF) و CI.
export function computeAssetsHash(assets = readCoreAssets()) {
    const hash = createHash('sha256');
    for (const asset of assets) {
        const content = readFileSync(join(ROOT, asset), 'utf8').replace(/\r\n/g, '\n');
        hash.update(asset).update('\0').update(content).update('\0');
    }
    return hash.digest('hex').slice(0, 12);
}

export function readRecordedHash(swSource = readFileSync(SW_PATH, 'utf8')) {
    const m = swSource.match(HASH_LINE);
    return m ? m[1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const source = readFileSync(SW_PATH, 'utf8');
    const current = computeAssetsHash(readCoreAssets(source));
    if (readRecordedHash(source) === current) {
        console.log(`ASSETS_HASH محدَّثة: ${current}`);
    } else {
        writeFileSync(SW_PATH, source.replace(HASH_LINE, `const ASSETS_HASH = '${current}';`));
        console.log(`حُدِّثت ASSETS_HASH إلى ${current}`);
    }
}
