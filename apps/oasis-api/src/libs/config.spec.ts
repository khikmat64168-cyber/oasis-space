import { isValidTarget, isValidImage, shapeIntoMongoObjectId } from './config';
import { ObjectId } from 'bson';

describe('isValidTarget (upload path-traversal guard)', () => {
	it('accepts the allowlisted folders', () => {
		expect(isValidTarget('member')).toBe(true);
		expect(isValidTarget('plant')).toBe(true);
		expect(isValidTarget('article')).toBe(true);
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
	});

	it('rejects non-images', () => {
		expect(isValidImage('a.txt', 'text/plain')).toBe(false);
		expect(isValidImage('script.exe', 'application/x-msdownload')).toBe(false);
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
