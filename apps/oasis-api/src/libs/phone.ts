/**
 * Phone normalisation.
 *
 * Every number reaching the database or an SMS provider goes through here, so
 * "010-1234-5678", "01012345678" and "+82 10 1234 5678" are one account rather
 * than three. Without this a unique index on memberPhone is decorative.
 *
 * Deliberately not a full libphonenumber dependency: the catalogue is Korean
 * and the only shapes that actually arrive are a local 0-prefixed number or an
 * already-international one. Anything else is passed through as +<digits> and
 * left for the provider to reject, rather than silently mangled.
 */

const DEFAULT_COUNTRY_CODE = process.env.PHONE_DEFAULT_COUNTRY_CODE?.trim() || '82';

/** Returns E.164 ("+821012345678"), or null when it cannot be one. */
export const normalisePhone = (raw: string | undefined | null): string | null => {
	if (!raw) return null;
	const trimmed = String(raw).trim();
	if (!trimmed) return null;

	const hadPlus = trimmed.startsWith('+');
	const digits = trimmed.replace(/\D/g, '');
	if (!digits) return null;

	let e164: string;
	if (hadPlus) {
		e164 = `+${digits}`;
	} else if (digits.startsWith('00')) {
		// 00 is the international prefix in Korea and much of the world
		e164 = `+${digits.slice(2)}`;
	} else if (digits.startsWith('0')) {
		// a national number: drop the trunk 0, prepend the country code
		e164 = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
	} else if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
		e164 = `+${digits}`;
	} else {
		e164 = `+${DEFAULT_COUNTRY_CODE}${digits}`;
	}

	// E.164 allows 15 digits at most, and nothing real is shorter than 8
	const body = e164.slice(1);
	if (body.length < 8 || body.length > 15) return null;
	return e164;
};

export const isValidPhone = (raw: string | undefined | null): boolean => normalisePhone(raw) !== null;

/**
 * Email normalisation — lowercase and trim only.
 *
 * No plus-address stripping: "a+oasis@x.com" is a different mailbox the owner
 * chose, and collapsing it would merge two accounts the user keeps apart.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normaliseEmail = (raw: string | undefined | null): string | null => {
	if (!raw) return null;
	const value = String(raw).trim().toLowerCase();
	if (!value || !EMAIL_RE.test(value) || value.length > 254) return null;
	return value;
};
