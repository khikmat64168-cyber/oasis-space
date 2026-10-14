import { Schema } from 'mongoose';
import { AgentApplicationStatus } from '../libs/enums/agentApplication.enum';

/**
 * One application to become an agent.
 *
 * Kept in its own collection rather than as fields on Member for two
 * reasons. The organisation's registration number is the most sensitive
 * value this product stores and belongs behind its own projection, not on a
 * document that is read by the public agent directory on every page. And a
 * review has a life of its own — who decided, when, on what note — which
 * does not belong on the account it is about.
 */
const AgentApplicationSchema = new Schema(
	{
		// the account that applied; one live application per member
		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		organizationName: {
			type: String,
			required: true,
			trim: true,
		},

		/**
		 * The business registration number.
		 *
		 * `select: false` so it is absent from every query that does not ask
		 * for it by name — the admin detail view asks, nothing else can. The
		 * list view and the applicant's own status screen are served a masked
		 * form built in the service, never this field.
		 */
		businessRegistrationNumber: {
			type: String,
			required: true,
			trim: true,
			select: false,
		},

		applicationStatus: {
			type: String,
			enum: AgentApplicationStatus,
			default: AgentApplicationStatus.PENDING,
		},

		// who reviewed it, and when — only ever written by an ADMIN path
		reviewedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},
		reviewedAt: {
			type: Date,
		},

		/**
		 * The reviewing admin's own note.
		 *
		 * Internal: it is returned to ADMIN queries and is never part of
		 * anything the applicant can read. The applicant is told the decision,
		 * not the reasoning behind it.
		 */
		reviewNote: {
			type: String,
			select: false,
		},
	},
	{ timestamps: true },
);

/*
 * One application per member.
 *
 * A partial index, so only a PENDING row is constrained: an applicant whose
 * application was rejected may apply again later, and an approved one keeps
 * its historical row. This is what makes a double-submitted signup idempotent
 * at the database rather than only in the service.
 */
AgentApplicationSchema.index(
	{ memberId: 1 },
	{ unique: true, partialFilterExpression: { applicationStatus: AgentApplicationStatus.PENDING } },
);

/* the admin queue is "pending, newest first" */
AgentApplicationSchema.index({ applicationStatus: 1, createdAt: -1 });

export default AgentApplicationSchema;
