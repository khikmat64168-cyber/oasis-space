import { registerEnumType } from '@nestjs/graphql';

/**
 * Where an agent application stands.
 *
 * Deliberately separate from `MemberStatus`: the member row says what the
 * account may currently DO, this says what the review decided. They move
 * together on approval, but a rejected application leaves a member row that
 * still exists and still owns its history — rejection is not deletion.
 */
export enum AgentApplicationStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}
registerEnumType(AgentApplicationStatus, { name: 'AgentApplicationStatus' });
