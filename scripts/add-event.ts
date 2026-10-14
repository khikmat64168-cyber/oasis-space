/*
 * Add an event to the Oasis Space homepage. ADMIN only.
 *
 *     npm run event:add
 *
 * Asks for the admin login, then the event, shows a summary and asks before
 * creating anything. It goes through the GraphQL API rather than straight to
 * MongoDB — unlike the other scripts in this folder — so the ADMIN guard and
 * the EventInput validation apply exactly as they would to any other caller.
 *
 * Talks to http://localhost:3013 unless OASIS_API is set:
 *
 *     OASIS_API=https://api.example.com npm run event:add
 *
 * Node 20's own fetch, FormData and Blob; no dependencies. The same steps by
 * hand are in ~/Desktop/oasis-demo/docs/events.md.
 */
import { readFileSync, statSync, existsSync } from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Writable } from 'stream';

const API = (process.env.OASIS_API ?? 'http://localhost:3013').replace(/\/$/, '') + '/graphql';
const SITE = process.env.OASIS_SITE ?? 'http://localhost:3011';

/* the API's own limits: EventInput, isValidImage, graphqlUploadExpress */
const IMAGE_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
};
const MAX_IMAGE_BYTES = 15_000_000;
/** the site serves Korea; a time typed here is Korean time */
const TIMEZONE = '+09:00';

/** Thrown for anything the person running the script should read and act on. */
class Stop extends Error {}

/*
 * Input.
 *
 * Every line typed or pasted goes into one queue, so nothing is lost and
 * nothing reaches the wrong question. A paste arrives as a burst: the lines
 * that land within a moment of the first are the rest of the same answer.
 * Readline's own `question` cannot tell the two apart — a multi-paragraph
 * description used to answer "Date" with its second paragraph.
 */
const PASTE_WINDOW_MS = 150;

/* the echo can be switched off, so the password is not shown */
let muted = false;
const output = new Writable({
	write(chunk, encoding, done) {
		if (!muted) process.stdout.write(chunk, encoding);
		done();
	},
});
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

const queue: string[] = [];
let waiting: ((line: string | null) => void) | null = null;
let closed = false;
rl.on('line', (line) => {
	if (waiting) {
		const resolve = waiting;
		waiting = null;
		resolve(line);
	} else {
		queue.push(line);
	}
});
rl.on('close', () => {
	closed = true;
	waiting?.(null);
});

const nextLine = (): Promise<string> => {
	if (queue.length) return Promise.resolve(queue.shift() as string);
	if (closed) return Promise.reject(new Stop('\nInput ended. Nothing was created.'));
	return new Promise((resolve, reject) => {
		waiting = (line) => (line === null ? reject(new Stop('\nInput ended. Nothing was created.')) : resolve(line));
	});
};

/** One answer: the line typed, plus any further lines pasted with it. */
const answer = async (label: string): Promise<string[]> => {
	rl.setPrompt(label);
	rl.prompt();
	const first = await nextLine();
	await new Promise((resolve) => setTimeout(resolve, PASTE_WINDOW_MS));
	return [first, ...queue.splice(0)];
};

/** For every field but the description: one line, or ask again. */
const answerLine = async (label: string): Promise<string> => {
	for (;;) {
		const lines = (await answer(label)).filter((line) => line.trim());
		if (lines.length <= 1) return (lines[0] ?? '').trim();
		console.log('  That was several lines — please answer on one line.');
	}
};

const askHidden = async (label: string): Promise<string> => {
	process.stdout.write(label);
	muted = true;
	try {
		return (await answer('')).join('');
	} finally {
		muted = false;
		process.stdout.write('\n');
	}
};

const ask = async (label: string, min: number, max: number, fallback?: string): Promise<string> => {
	for (;;) {
		const hint = fallback ? ` [${fallback}]` : '';
		const value = (await answerLine(`${label}${hint}: `)) || fallback || '';
		if (value.length >= min && value.length <= max) return value;
		console.log(`  ${min}–${max} characters, please (you typed ${value.length}).`);
	}
};

/**
 * The description may be pasted as several paragraphs. They are joined into
 * one: the card shows two lines of it and has nowhere to put a paragraph
 * break, and there is no event page that would show the rest.
 */
const askDescription = async (): Promise<string> => {
	for (;;) {
		const value = (await answer('Description (one or two sentences — the card shows about two lines): '))
			.map((line) => line.trim())
			.filter(Boolean)
			.join(' ');
		if (value.length >= 5 && value.length <= 500) return value;
		console.log(`  5–500 characters, please (that was ${value.length}). Shorten it and paste again.`);
	}
};

const today = (): string => {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const askDate = async (): Promise<string> => {
	for (;;) {
		const value = await answerLine('Date (YYYY-MM-DD): ');
		const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
		if (!valid) {
			console.log('  Like 2026-11-14, please.');
		} else if (value < today()) {
			console.log('  That day has passed — the homepage only shows events that have not happened yet.');
		} else {
			return value;
		}
	}
};

const askTime = async (): Promise<string> => {
	for (;;) {
		const value = await answerLine('Start time (HH:MM, Korean time, Enter to leave out): ');
		if (!value) return '00:00';
		if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
		console.log('  Like 10:30, please.');
	}
};

const askImage = async (): Promise<string> => {
	for (;;) {
		// a file dragged into the macOS Terminal arrives quoted, or with "\ "
		const raw = (await answerLine('Image file (drag it here): ')).replace(/^['"]|['"]$/g, '').replace(/\\ /g, ' ');
		const file = raw.startsWith('~') ? path.join(process.env.HOME ?? '', raw.slice(1)) : raw;
		if (!file || !existsSync(file) || !statSync(file).isFile()) console.log('  No file there.');
		else if (!IMAGE_TYPES[path.extname(file).toLowerCase()]) console.log('  .png, .jpg, .jpeg or .webp only.');
		else if (statSync(file).size > MAX_IMAGE_BYTES) console.log('  Larger than 15MB — the API would refuse it.');
		else return file;
	}
};

/** "y" or "yes", in any case; anything else is a no. */
const confirm = async (label: string): Promise<boolean> =>
	['y', 'yes'].includes((await answerLine(label)).toLowerCase());

const send = async (init: RequestInit): Promise<any> => {
	let response: Response;
	try {
		response = await fetch(API, { method: 'POST', ...init });
	} catch {
		throw new Stop(`Cannot reach the API at ${API}. Is it running?`);
	}
	let body: any;
	try {
		body = await response.json();
	} catch {
		throw new Stop(`The API answered ${response.status} ${response.statusText}.`);
	}
	if (body.errors?.length) throw new Stop(`The API refused: ${body.errors[0].message ?? 'unknown error'}`);
	return body.data;
};

const gql = (query: string, variables: object, token?: string) =>
	send({
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
		body: JSON.stringify({ query, variables }),
	});

/** The same multipart request apollo-upload-client sends from the browser. */
const uploadImage = async (file: string, token: string): Promise<string> => {
	const form = new FormData();
	form.append(
		'operations',
		JSON.stringify({
			query: 'mutation($file:Upload!){imageUploader(file:$file,target:"event")}',
			variables: { file: null },
		}),
	);
	form.append('map', JSON.stringify({ 0: ['variables.file'] }));
	const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
	form.append('0', new Blob([readFileSync(file)], { type }), path.basename(file));

	const data = await send({
		// Apollo Server 4 refuses a multipart request without this header (CSRF)
		headers: { Authorization: `Bearer ${token}`, 'apollo-require-preflight': 'true' },
		body: form,
	});
	return data.imageUploader;
};

/** Read the role out of the token, so a non-admin stops before anything is uploaded. */
const memberTypeOf = (token: string): string | undefined => {
	try {
		return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).memberType;
	} catch {
		return undefined;
	}
};

const main = async () => {
	console.log(`Oasis Space — new homepage event  (${API})\n`);

	const nick = await ask('Admin nick', 1, 100, 'Admin1');
	const password = await askHidden('Admin password: ');
	let token: string;
	try {
		const data = await gql('mutation($i:LoginInput!){login(input:$i){accessToken}}', {
			i: { memberNick: nick, memberPassword: password },
		});
		token = data.login.accessToken;
	} catch (err) {
		throw new Stop(`Sign-in failed — check the nick and password. (${(err as Error).message})`);
	}
	if (memberTypeOf(token) !== 'ADMIN') {
		throw new Stop('Signed in, but this account is not the ADMIN. Only the ADMIN can add events.');
	}
	console.log('  Signed in as ADMIN.\n');

	const title = await ask('Title', 3, 100);
	const desc = await askDescription();
	const day = await askDate();
	const time = await askTime();
	const location = await ask('Location (e.g. Seoul Forest, Seongdong-gu)', 2, 120);
	const image = await askImage();

	console.log(`
  Title        ${title}
  Description  ${desc}
  When         ${time === '00:00' ? day : `${day} ${time} (KST)`}
  Where        ${location}
  Image        ${image}
`);
	if (!(await confirm('Create this event? [y/N]: '))) {
		throw new Stop('Nothing was created.');
	}

	const eventImage = await uploadImage(image, token);
	let created: { _id: string };
	try {
		const data = await gql(
			'mutation($i:EventInput!){createEvent(input:$i){_id eventTitle eventDate}}',
			{
				i: {
					eventTitle: title,
					eventDesc: desc,
					eventImage,
					eventDate: `${day}T${time}:00${TIMEZONE}`,
					eventLocation: location,
				},
			},
			token,
		);
		created = data.createEvent;
	} catch (err) {
		throw new Stop(
			`${(err as Error).message}\nThe image was uploaded but the event was not created; delete ${eventImage} from this folder.`,
		);
	}

	console.log(`\nCreated ${created._id}.`);
	console.log(`Open ${SITE} and scroll down to the tree trunk — the card is there.`);
};

main()
	.catch((err) => {
		console.error(err instanceof Stop ? err.message : err);
		process.exitCode = 1;
	})
	.finally(() => rl.close());

/* Ctrl+C while a question is open */
rl.on('SIGINT', () => {
	console.log('\nCancelled. Nothing was created.');
	process.exit(130);
});
