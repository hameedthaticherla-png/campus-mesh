#!/usr/bin/env node
/**
 * Campus Mesh — Dummy File Generator Script
 * Usage: node scripts/generate-dummy-file.js --size=100MB --out=./storage/uploads/sample-100mb.bin
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
let sizeMb = 100;
let outputPath = './storage/uploads/sample-resource.bin';

for (const arg of args) {
  if (arg.startsWith('--size=')) {
    const raw = arg.split('=')[1].toUpperCase();
    if (raw.endsWith('GB')) {
      sizeMb = Number.parseFloat(raw.replace('GB', '')) * 1024;
    } else {
      sizeMb = Number.parseFloat(raw.replace('MB', '')) || 100;
    }
  } else if (arg.startsWith('--out=')) {
    outputPath = arg.split('=')[1];
  }
}

const resolvedPath = path.resolve(process.cwd(), outputPath);
const targetDir = path.dirname(resolvedPath);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`[Campus Mesh] Generating ${sizeMb} MB synthetic test resource...`);
console.log(`[Campus Mesh] Output path: ${resolvedPath}`);

const totalBytes = Math.floor(sizeMb * 1024 * 1024);
const writeStream = fs.createWriteStream(resolvedPath);
const hash = crypto.createHash('sha256');

const chunkSize = 1024 * 1024; // 1 MB buffer per write
let bytesWritten = 0;

function writeNext() {
  let ok = true;
  while (bytesWritten < totalBytes && ok) {
    const toWrite = Math.min(chunkSize, totalBytes - bytesWritten);
    const buffer = crypto.randomBytes(toWrite);
    hash.update(buffer);
    bytesWritten += toWrite;
    ok = writeStream.write(buffer);
  }

  if (bytesWritten < totalBytes) {
    writeStream.once('drain', writeNext);
  } else {
    writeStream.end(() => {
      const finalHash = hash.digest('hex');
      console.log(`[Campus Mesh] File successfully generated!`);
      console.log(`[Campus Mesh] Total Bytes: ${bytesWritten.toLocaleString()}`);
      console.log(`[Campus Mesh] Overall SHA-256: ${finalHash}`);
    });
  }
}

writeNext();
