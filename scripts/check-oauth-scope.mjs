import { readFileSync } from 'node:fs';

const settingsPath = new URL('../src/lib/at/settings.ts', import.meta.url);
const metadataPath = new URL('../static/client-metadata.json', import.meta.url);

const settingsText = readFileSync(settingsPath, 'utf8');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));

function extractArrayLiteral(name) {
	const regex = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`, 'm');
	const match = settingsText.match(regex);
	if (!match) return [];
	return [...match[1].matchAll(/([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]);
}

function resolveConstString(name) {
	const regex = new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`, 'm');
	const match = settingsText.match(regex);
	if (!match) {
		throw new Error(`Could not resolve constant "${name}" from settings.ts`);
	}
	return match[1];
}

const collectionConstNames = extractArrayLiteral('collections');
const blobLiterals = [...settingsText.matchAll(/blobs:\s*\[([^\]]*)\]/gm)]
	.flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]));

const repoScopes = collectionConstNames.map((constName) => `repo:${resolveConstString(constName)}`);
const blobScope = blobLiterals.length > 0 ? `blob?${blobLiterals.map((b) => `accept=${b}`).join('&')}` : null;
const expectedScope = ['atproto', ...repoScopes, blobScope].filter(Boolean).join(' ');

const actualScope = metadata.scope;

if (actualScope !== expectedScope) {
	console.error('OAuth scope mismatch detected.');
	console.error(`Expected: ${expectedScope}`);
	console.error(`Actual:   ${actualScope}`);
	process.exit(1);
}

console.log('OAuth scope check passed.');
console.log(`Scope: ${actualScope}`);
