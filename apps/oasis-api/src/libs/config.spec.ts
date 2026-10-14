import { isValidTarget, isValidImage, isValidModel, isValidModelTarget, shapeIntoMongoObjectId } from './config';
import { ObjectId } from 'bson';

describe('isValidTarget (upload path-traversal guard)', () => {
	it('accepts the allowlisted folders', () => {
		expect(isValidTarget('member')).toBe(true);
		expect(isValidTarget('plant')).toBe(true);
		expect(isValidTarget('article')).toBe(true);
		expect(isValidTarget('event')).toBe(true);
	});

	it('rejects traversal / unknown targets', () => {
		expect(isValidTarget('../../evil')).toBe(false);
		expect(isValidTarget('..')).toBe(false);
		expect(isValidTarget('property')).toBe(false);
		expect(isValidTarget('')).toBe(false);
	});
});

describe('isValidImage', () => {
	it('accepts by mime or by extension', () => {
		expect(isValidImage('a.png', 'image/png')).toBe(true);
		expect(isValidImage('a.jpeg', 'application/octet-stream')).toBe(true); // ext ok
		expect(isValidImage('a.unknown', 'image/jpeg')).toBe(true); // mime ok
		expect(isValidImage('a.webp', 'image/webp')).toBe(true);
		// browsers that report webp as a generic binary still pass on extension
		expect(isValidImage('a.webp', 'application/octet-stream')).toBe(true);
	});

	it('rejects non-images', () => {
		expect(isValidImage('a.txt', 'text/plain')).toBe(false);
		expect(isValidImage('script.exe', 'application/x-msdownload')).toBe(false);
	});
});

describe('isValidModel', () => {
	it('accepts gltf binaries by extension, case-insensitively', () => {
		expect(isValidModel('tree.glb')).toBe(true);
		expect(isValidModel('tree.GLB')).toBe(true);
		expect(isValidModel('tree.gltf')).toBe(true);
	});

	// the mimetype is deliberately not consulted: most browsers report .glb as
	// application/octet-stream, so trusting it would admit any binary
	it('rejects everything else', () => {
		expect(isValidModel('a.png')).toBe(false);
		expect(isValidModel('payload.exe')).toBe(false);
		expect(isValidModel('noext')).toBe(false);
	});
});

describe('isValidModelTarget', () => {
	it('allows only the plant folder', () => {
		expect(isValidModelTarget('plant')).toBe(true);
		expect(isValidModelTarget('member')).toBe(false);
		expect(isValidModelTarget('../etc')).toBe(false);
	});
});

describe('shapeIntoMongoObjectId', () => {
	it('converts a hex string into an ObjectId', () => {
		const hex = '000000000000000000000001';
		const res = shapeIntoMongoObjectId(hex);
		expect(res).toBeInstanceOf(ObjectId);
		expect(res.toString()).toBe(hex);
	});

	it('passes a non-string through unchanged', () => {
		const id = new ObjectId();
		expect(shapeIntoMongoObjectId(id)).toBe(id);
	});
});
