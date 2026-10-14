import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Member, Members } from '../../libs/dto/member/member';
import {
	AgentsInquiry,
	LoginInput,
	MemberInput,
	MembersInquiry,
	MemberUpdateInput,
} from '../../libs/dto/member/member.input';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { Direction, ErrorCode, Message } from '../../libs/Errors';
import { AuthService } from '../auth/auth.service';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { StatisticModifier, T } from '../../libs/types/common';
import { ViewService } from '../view/view.service';
import { ViewGroup } from '../../libs/enums/view.enum';
import { AgentApplicationService } from '../agentApplication/agentApplication.service';
import { AgentApplicationStatus } from '../../libs/enums/agentApplication.enum';
import { LikeInput } from '../../libs/dto/member/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';
import { LikeService } from '../like/like.service';
import { Follower, Following, MeFollowed } from '../../libs/dto/member/follow/follow';
import { lookupAuthMemberLiked } from '../../libs/config';
import { normaliseEmail, normalisePhone } from '../../libs/phone';
import { VerificationService } from '../verification/verification.service';

/**
 * Which unique value a Mongo duplicate-key error (E11000) collided on, as
 * the code the signup form shows beside that field. Null for any other error.
 */
export const duplicateField = (err: unknown): ErrorCode | null => {
	if (!(err && typeof err === 'object' && (err as { code?: number }).code === 11000)) return null;
	const keys = Object.keys((err as { keyPattern?: object }).keyPattern ?? {});
	if (keys.includes('memberNick')) return ErrorCode.MEMBER_NICK_TAKEN;
	if (keys.includes('memberPhone')) return ErrorCode.PHONE_ALREADY_REGISTERED;
	if (keys.includes('memberEmail')) return ErrorCode.EMAIL_ALREADY_REGISTERED;
	return ErrorCode.CONFLICT;
};

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		@InjectModel('Follow') private readonly followModel: Model<Follower | Following>,

		private authService: AuthService,
		private viewService: ViewService,
		private likeService: LikeService,
		private verificationService: VerificationService,
		private agentApplicationService: AgentApplicationService,
	) {}
	/**
	 * Create an account.
	 *
	 * The phone number is taken from the verification ticket, never from the
	 * request body: the ticket is signed by this server and carries the number
	 * verifyPhoneCode actually confirmed, so a client cannot register one
	 * number while proving another, and `memberPhoneVerified` has no
	 * client-supplied path at all.
	 *
	 * When no SMS provider is configured the ticket is not demanded — the
	 * deployment cannot issue one, and refusing every signup would take the
	 * whole product down for a feature that is switched off. The account is
	 * then created with memberPhoneVerified false, which is the honest state.
	 */
	public async signup(input: MemberInput): Promise<Member> {
		const smsConfigured = this.verificationService.smsAvailable;
		let phone = normalisePhone(input.memberPhone);
		let phoneVerified = false;

		if (smsConfigured) {
			// the ticket is the only accepted proof; its payload wins
			phone = await this.verificationService.consumeTicket(input.verificationTicket ?? '');
			phoneVerified = true;
		}
		if (!phone) throw new BadRequestException('INVALID_PHONE');

		const email = normaliseEmail(input.memberEmail);
		if (input.memberEmail && !email) throw new BadRequestException('INVALID_EMAIL');

		/*
		 * Which of the two registration paths this is.
		 *
		 * The requested type used to be dropped entirely — the input did not
		 * carry it and the schema default made every account a CLIENT, which
		 * is why picking AGENT on the form produced a client and somebody
		 * then edited MongoDB by hand. It is honoured now, but an AGENT
		 * request does not create an agent: it creates a PENDING account and
		 * an application. ADMIN is unreachable: the input validator permits
		 * only CLIENT and AGENT.
		 */
		const wantsAgent = input.memberType === MemberType.AGENT;
		const organizationName = input.organizationName?.trim() ?? '';
		const registrationNumber = input.businessRegistrationNumber?.trim() ?? '';

		if (wantsAgent) {
			// validated here as well as in the browser: the form is a
			// convenience, this is the rule
			if (organizationName.length < 2) throw new BadRequestException('ORGANIZATION_NAME_REQUIRED');
			if (!/^[0-9A-Za-z-]{5,40}$/.test(registrationNumber.replace(/\s+/g, ''))) {
				throw new BadRequestException('BUSINESS_REGISTRATION_NUMBER_INVALID');
			}
		} else if (organizationName || registrationNumber) {
			// a client signup carrying organisation fields is a payload that
			// was edited; it is refused rather than quietly ignored
			throw new BadRequestException('ORGANIZATION_FIELDS_NOT_ALLOWED');
		}

		//Hashing password
		input.memberPassword = await this.authService.hashPassword(input.memberPassword); //hashPassword auth.service dan call qilinvotti
		try {
			const result = await this.memberModel.create({
				...input,
				memberPhone: phone,
				memberPhoneVerified: phoneVerified,
				// the requested role is kept, so the registration intent is
				// never lost — but an agent starts PENDING and can do nothing
				// until an ADMIN approves the application below
				memberType: wantsAgent ? MemberType.AGENT : MemberType.CLIENT,
				memberStatus: wantsAgent ? MemberStatus.PENDING : MemberStatus.ACTIVE,
				// never persisted on the member document
				verificationTicket: undefined,
				organizationName: undefined,
				businessRegistrationNumber: undefined,
				...(email ? { memberEmail: email, memberEmailVerified: false } : {}),
			});

			if (wantsAgent) {
				/*
				 * No token. A pending applicant gets a receipt and a waiting
				 * screen; issuing an access token here — or letting the
				 * resolver open a refresh session — is exactly the hole this
				 * workflow exists to close.
				 */
				const receipt = await this.agentApplicationService.createForSignup({
					memberId: result._id,
					memberNick: result.memberNick,
					organizationName,
					businessRegistrationNumber: registrationNumber,
				});
				result.agentApplication = receipt;
				return result;
			}

			//Auth via tokens
			result.accessToken = await this.authService.createToken(result);

			return result;
		} catch (err) {
			/*
			 * Only a duplicate-key error is a duplicate, and its index names
			 * which value is taken. Everything else used to be reported as
			 * "nick or phone already used" too — including a failure to create
			 * the agent application, which has nothing to do with either.
			 */
			const duplicate = duplicateField(err);
			if (duplicate) throw new ConflictException(duplicate);
			// an HttpException keeps its own code; anything else is unexpected,
			// and the formatter logs it under a request id and sends the client
			// a safe message instead of the driver's text
			throw err;
		}
	}

	/**
	 * Unchanged on purpose.
	 *
	 * Login has always matched on memberNick + password and has never consulted
	 * memberPhoneVerified. Gating it on verification would lock out every
	 * account that existed before this feature, so it does not.
	 */
	public async login(input: LoginInput): Promise<Member> {
		const { memberNick } = input;
		const response = await this.memberModel.findOne({ memberNick: memberNick }).select('+memberPassword').exec();

		/*
		 * One answer for "no such member" and "wrong password".
		 *
		 * These were NO_MEMBER_NICK and WRONG_PASSWORD, so the login form
		 * said which nicknames exist. A deleted account answers the same way.
		 * Account state — blocked, pending — is only named AFTER the password
		 * matched, when the caller has proved it is their account.
		 */
		if (!response || response.memberStatus === MemberStatus.DELETE) {
			throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
		}

		const isMatch = await this.authService.comparePassword(input.memberPassword, response.memberPassword ?? '');
		if (!isMatch) throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);

		if (response.memberStatus === MemberStatus.BLOCK) {
			throw new ForbiddenException(ErrorCode.ACCOUNT_BLOCKED);
		}

		/*
		 * An agent application that has not been approved gets no session.
		 *
		 * Checked AFTER the password, deliberately: answering differently
		 * before it would turn login into an oracle that says which
		 * nicknames are pending applications. The error names the state
		 * because the applicant is the one who just proved who they are.
		 */
		if (response.memberStatus === MemberStatus.PENDING) {
			const application = await this.agentApplicationService.latestStatusFor(response._id);
			throw new ForbiddenException(
				application === AgentApplicationStatus.REJECTED
					? 'AGENT_APPLICATION_REJECTED'
					: 'AGENT_APPLICATION_PENDING',
			);
		}

		delete response.memberPassword;
		response.accessToken = await this.authService.createToken(response);

		return response;
	}

	/**
	 * The member behind a refresh session, or null when the account may no
	 * longer sign in.
	 *
	 * Possession of a refresh cookie must not outrank the account's own state:
	 * a member blocked or deleted after signing in has to stop getting new
	 * access tokens, not keep minting them until the cookie expires.
	 */
	public async getMemberForSession(memberId: ObjectId | string): Promise<Member | null> {
		const member = await this.memberModel.findById(memberId).exec();
		if (!member) return null;
		if (member.memberStatus !== MemberStatus.ACTIVE) return null;
		return member;
	}

	public async updateMember(memberId: ObjectId, input: MemberUpdate): Promise<Member> {
		const result = await this.memberModel
			.findOneAndUpdate(
				{
					_id: memberId,
					memberStatus: MemberStatus.ACTIVE,
				},
				input,
				{ new: true },
			)
			.exec();
		if (!result) throw new InternalServerErrorException(Message.UPLOAD_FAILED);

		result.accessToken = await this.authService.createToken(result);
		return result;
	}

	public async getMember(memberId: ObjectId | null, targetId: ObjectId): Promise<Member> {
		const search: T = {
			_id: targetId,
			memberStatus: {
				$in: [MemberStatus.ACTIVE, MemberStatus.BLOCK],
			},
		};

		const targetMember: Member | null = await this.memberModel.findOne(search).lean().exec();
		if (!targetMember) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		if (memberId) {
			// recordView
			const viewInput = { memberId: memberId, viewRefId: targetId, viewGroup: ViewGroup.MEMBER };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				//increase memberView
				await this.memberModel.findOneAndUpdate(search, { $inc: { memberViews: 1 } }, { new: true }).exec();
				targetMember.memberViews++;
			}

			const likeInput = { memberId: memberId, likeRefId: targetId, likeGroup: LikeGroup.MEMBER };
			const existingLike = await this.likeService.checkLikeExistence(likeInput);
			targetMember.meLiked = existingLike ? [existingLike] : [];

			targetMember.meFollowed = await this.checkSubscription(memberId, targetId);
		}
		return targetMember;
	}

	public async getProducts(): Promise<string> {
		return 'getMember executed';
	}

	public async getAgents(memberId: ObjectId, input: AgentsInquiry): Promise<Members> {
		const { text } = input.search ?? {};
		const match: T = { memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (text) match.memberNick = { $regex: new RegExp(text, 'i') };
		console.log('match:', match);

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, lookupAuthMemberLiked(memberId)],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		console.log('result:', result);

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	public async likeTargetMember(memberId: ObjectId, likeRefId: ObjectId): Promise<Member> {
		const target: Member | null = await this.memberModel
			.findOne({ _id: likeRefId, memberStatus: MemberStatus.ACTIVE })
			.exec();
		if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const input: LikeInput = {
			memberId: memberId,
			likeRefId: likeRefId,
			likeGroup: LikeGroup.MEMBER,
		};

		// LIKE TOGGLE via Like module
		const modifier: number = await this.likeService.toggleLike(input);
		const result = await this.memberStatsEditor({ _id: likeRefId, targetKey: 'memberLikes', modifier: modifier });

		if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const { memberStatus, memberType, text } = input.search ?? {};
		const match: T = {};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (memberStatus) match.memberStatus = memberStatus;
		if (memberType) match.memberType = memberType;

		if (text) match.memberNick = { $regex: new RegExp(text, 'i') };
		console.log('match:', match);

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		console.log('result:', result);

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	public async updateMemberByAdmin(input: MemberUpdate): Promise<Member> {
		const result = await this.memberModel.findOneAndUpdate({ _id: input._id }, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);
		return result;
	}

	public async memberStatsEditor(input: StatisticModifier): Promise<Member> {
		console.log('executed');
		const { _id, targetKey, modifier } = input;
		const result = await this.memberModel
			.findOneAndUpdate({ _id }, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);
		return result;
	}

	public async checkSubscription(followerId: ObjectId, followingId: ObjectId): Promise<MeFollowed[]> {
		const result = await this.followModel.findOne({ followingId: followingId, followerId: followerId }).exec();
		return result ? [{ followerId: followerId, followingId: followingId, myFollowing: true }] : [];
	}
}
