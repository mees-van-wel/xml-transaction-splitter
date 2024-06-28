const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();
const builder = new xml2js.Builder();

const MAX_SIZE = 10000000; // 10MB in bytes

async function readXML(file) {
  const data = await fs.promises.readFile(path.join('./in', file));
  return parser.parseStringPromise(data);
}

async function writeXML(file, index, data) {
  const xml = builder.buildObject(data);
  return fs.promises.writeFile(path.join('./out', `${file}-chunk-${index}.xml`), xml);
}

async function checkSize(data) {
  const xml = builder.buildObject(data);
  return Buffer.from(xml).length;
}

async function processFile(file, fileIndex, totalFiles) {
  console.log(`Processing file ${file} (${fileIndex + 1}/${totalFiles})`);

  const parsedData = await readXML(file);
  let transactions = parsedData.eExact.GLTransactions[0].GLTransaction;

  let chunks = [];
  let chunk = [];

  for (let i = 0; i < transactions.length; i++) {
    chunk.push(transactions[i]);
    const chunkSize = await checkSize({ eExact: { GLTransactions: { GLTransaction: chunk } } });

    if (chunkSize > MAX_SIZE) {
      chunks.push(chunk.slice(0, -1));
      chunk = [transactions[i]];
    }
  }

  return Promise.all(chunks.map(async (currentChunks, i) => {
    const newParsedData = JSON.parse(JSON.stringify(parsedData)); // Deep copy
    newParsedData.eExact.GLTransactions[0].GLTransaction = currentChunks;

    const chunkSize = await checkSize(newParsedData);

    if (chunkSize > MAX_SIZE) {
      currentChunks.forEach((chunk, chunkIndex) => {
        chunk.GLTransactionLine.forEach((tl, tlIndex) => {
          if (newParsedData.eExact.GLTransactions[0].GLTransaction[chunkIndex].GLTransactionLine[tlIndex].Document?.length) {
            newParsedData.eExact.GLTransactions[0].GLTransaction[chunkIndex].GLTransactionLine[tlIndex].Document[0].Attachments = [];
          }
        });
      });
    }

    console.log(`  - Writing chunk ${i + 1}/${chunks.length} for file ${file}`);
    return writeXML(file, i, newParsedData);
  }));
}

async function main() {
  const files = await fs.promises.readdir('./in');
  const totalFiles = files.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    await processFile(file, i, totalFiles);
  }
  console.log('All done!');
}

main().catch(err => console.error(err));
