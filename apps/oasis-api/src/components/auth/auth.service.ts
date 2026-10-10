import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus } from '../../libs/enums/member.enums';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * A verified token says who the member WAS when it was signed. The guards need
 * to know who they are NOW — a member blocked or deleted a minute ago must stop
 * working immediately, and a role change must take effect.
 *
 * Re-reading on every request would put a database round trip in front of every
 * resolver, so the live record is cached very briefly. Ten seconds is short
 * enough that a block takes effect while an operator is still watching, and
 * long enough to absorb the burst of queries a single page load makes.
 */
/** Part of the client contract — the frontend refreshes on exactly this one. */
export const ACCESS_TOKEN_EXPIRED = 'ACCESS_TOKEN_EXPIRED';
export const ACCESS_TOKEN_INVALID = 'ACCESS_TOKEN_INVALID';

const LIVE_MEMBER_TTL_MS = 10_000;
interface CachedMember {
	memberType: string;
	memberStatus: string;
	expiresAt: number;
}

@Injectable()
export class AuthService {
	private readonly liveMembers = new Map<string, CachedMember>();

	constructor(
		private jwtService: JwtService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}
	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await bcrypt.genSalt();
		return await bcrypt.hash(memberPassword, salt);
	}

	public async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
		return await bcrypt.compare(password, hashedPassword);
	}

	public async createToken(member: Member): Promise<string> {
		const payload: T = {};
		Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
			payload[`${ele}`] = member[`${ele}`];
		});
		// SECURITY: never embed the password hash in the JWT (it is base64-readable by any token holder)
		delete payload.memberPassword;
		return await this.jwtService.signAsync(payload);
	}

	/**
	 * Verify an access token, reporting WHY it failed in a stable way.
	 *
	 * jsonwebtoken's own errors surfaced through GraphQL as a generic
	 * INTERNAL_SERVER_ERROR carrying "jwt expired" or "invalid token", which
	 * left the client unable to tell an expired access token from a genuine
	 * server fault. It therefore could not decide when a refresh was the right
	 * response — and a client that guesses either refreshes on every error or
	 * never refreshes at all. These two messages are part of the contract now;
	 * the frontend matches on them.
	 */
	public async verifyToken(token: string): Promise<Member> {
		let member: T;
		try {
			member = await this.jwtService.verifyAsync(token);
		} catch (err: any) {
			if (err?.name === 'TokenExpiredError') throw new UnauthorizedException(ACCESS_TOKEN_EXPIRED);
			throw new UnauthorizedException(ACCESS_TOKEN_INVALID);
		}

		member._id = shapeIntoMongoObjectId(member._id);

		return member as Member;
	}

	/**
	 * Verify the signature AND confirm the account is still usable.
	 *
	 * The claims in the token are stale by construction, so memberType and
	 * memberStatus are overwritten with the stored values before the resolver
	 * sees them. Otherwise a member promoted to AGENT would have to sign out
	 * and in again, and — far worse — one blocked after signing in would keep
	 * full access until their token expired.
	 */
	public async verifyActiveToken(token: string): Promise<Member> {
		const member = await this.verifyToken(token);
		const live = await this.liveMember(String(member._id));

		if (!live) throw new UnauthorizedException('ACCOUNT_NOT_FOUND');
		if (live.memberStatus === MemberStatus.DELETE) throw new UnauthorizedException('ACCOUNT_DELETED');
		if (live.memberStatus === MemberStatus.BLOCK) throw new ForbiddenException('ACCOUNT_BLOCKED');

		member.memberType = live.memberType as Member['memberType'];
		member.memberStatus = live.memberStatus as Member['memberStatus'];
		return member;
	}

	private async liveMember(memberId: string): Promise<CachedMember | null> {
		const cached = this.liveMembers.get(memberId);
		if (cached && cached.expiresAt > Date.now()) return cached;

		const found = await this.memberModel
			.findById(memberId)
			.select('memberType memberStatus')
			.lean<{ memberType: string; memberStatus: string }>()
			.exec();
		if (!found) {
			this.liveMembers.delete(memberId);
			return null;
		}

		const entry: CachedMember = {
			memberType: found.memberType,
			memberStatus: found.memberStatus,
			expiresAt: Date.now() + LIVE_MEMBER_TTL_MS,
		};
		this.liveMembers.set(memberId, entry);
		if (this.liveMembers.size > 5000) this.sweepLiveMembers();
		return entry;
	}

	/** Drops a member's cached record so a change applies on the next request. */
	public invalidateLiveMember(memberId: string): void {
		this.liveMembers.delete(memberId);
	}

	private sweepLiveMembers(): void {
		const now = Date.now();
		for (const [id, entry] of this.liveMembers) if (entry.expiresAt <= now) this.liveMembers.delete(id);
	}
}
