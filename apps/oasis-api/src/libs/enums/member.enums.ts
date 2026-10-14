import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
	CLIENT = 'CLIENT',
	AGENT = 'AGENT',
	ADMIN = 'ADMIN',
}
registerEnumType(MemberType, { name: 'MemberType' });

export enum MemberStatus {
	ACTIVE = 'ACTIVE',
	/**
	 * An agent applicant whose organisation has not been reviewed yet.
	 *
	 * Deliberately a STATUS rather than a flag beside the role. Every
	 * authenticated request already passes through
	 * `AuthService.verifyActiveToken`, which re-reads the live member and
	 * refuses DELETE and BLOCK — so one more branch there closes every
	 * protected path at once. Every list in this codebase already asks for
	 * `memberStatus: ACTIVE`, which means a pending applicant is absent from
	 * the agent directory, the platform counters and the messaging
	 * recipients without a single query being changed.
	 *
	 * The applicant's REQUESTED role is kept on `memberType` (AGENT), so the
	 * registration intent is never lost or downgraded to CLIENT.
	 */
	PENDING = 'PENDING',
	BLOCK = 'BLOCK',
	DELETE = 'DELETE',
}
registerEnumType(MemberStatus, { name: 'MemberStatus' });

export enum MemberAuthType {
	PHONE = 'PHONE',
	EMAIL = 'EMAIL',
	TELEGRAM = 'TELEGRAM',
}
registerEnumType(MemberAuthType, { name: 'MemberAuthType' });
