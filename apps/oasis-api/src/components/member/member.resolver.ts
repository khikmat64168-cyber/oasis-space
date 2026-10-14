import { Mutation, Resolver, Query, Args, Context } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { InternalServerErrorException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import {
	AgentsInquiry,
	LoginInput,
	MemberInput,
	MembersInquiry,
	MemberUpdateInput,
} from '../../libs/dto/member/member.input';
import { Member, Members } from '../../libs/dto/member/member';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import * as mongoose from 'mongoose';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import {
	ensureUploadDir,
	getSerialForImage,
	isValidImage,
	isValidModel,
	isValidModelTarget,
	isValidTarget,
	shapeIntoMongoObjectId,
} from '../../libs/config';
import { WithoutGuard } from '../auth/guards/without.guard';
import { RefreshService } from '../auth/refresh.service';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../../libs/authConfig';

import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { createWriteStream } from 'fs';
import { Message } from '../../libs/Errors';

@Resolver()
export class MemberResolver {
	constructor(
		private readonly memberService: MemberService,
		private readonly refreshService: RefreshService,
	) {}

	/**
	 * Open a refresh session and put its token in the HttpOnly cookie.
	 *
	 * The token is written to Set-Cookie only — it is deliberately absent from
	 * the GraphQL payload, so it never reaches JavaScript, the Apollo cache, or
	 * a logged response body.
	 */
	private async startSession(member: Member, context: any): Promise<void> {
		const res = context?.res;
		if (!res?.cookie) {
			// nothing to attach a cookie to (a test harness, say). The access
			// token still works; the caller simply gets no refresh session,
			// which is safer than failing the login outright.
			console.warn('[auth] no response object on the GraphQL context; refresh cookie not set');
			return;
		}
		const issued = await this.refreshService.issue(member._id, context?.req?.headers?.['user-agent']);
		res.cookie(REFRESH_COOKIE_NAME, issued.token, refreshCookieOptions());
	}

	@Mutation(() => Member)
	// @UsePipes(ValidationPipe). Global integration dan so'ng olib tashlandi ?
	public async signup(@Args('input') input: MemberInput, @Context() context: any): Promise<Member> {
		try {
			console.log('Mutation : signup');
			const member = await this.memberService.signup(input);
			/*
			 * An agent application is not a sign-in.
			 *
			 * `signup` returns a receipt instead of an access token in that
			 * case, and no refresh session is opened: the applicant leaves
			 * this mutation with a waiting screen and a status ticket, not
			 * with a logged-in browser.
			 */
			if (!member.agentApplication) await this.startSession(member, context);
			return member;
		} catch (err) {
			console.log('Error, signup:', err);
			throw new InternalServerErrorException(err);
		}
	}

	@Mutation(() => Member)
	// @UsePipes(ValidationPipe). Global integration dan so'ng olib tashlandi ?
	public async login(@Args('input') input: LoginInput, @Context() context: any): Promise<Member> {
		try {
			console.log('Mutation: login');
			const member = await this.memberService.login(input);
			await this.startSession(member, context);
			return member;
		} catch (err) {
			console.log('Error, login:', err);
			throw new InternalServerErrorException(err);
		}
	}

	@UseGuards(AuthGuard)
	@Query(() => String)
	public async checkAuth(@AuthMember() authMember: Member): Promise<string> {
		console.log('Query : checkAuth');
		console.log('memberNicd:', authMember.memberNick);

		return `hi ${authMember.memberNick}, you are ${authMember.memberType} (memberId: ${authMember._id})`;
	}

	@Roles(MemberType.CLIENT)
	@UseGuards(AuthGuard)
	@Query(() => String)
	public async checkAuthRoles(@AuthMember() authMember: Member): Promise<string> {
		console.log('Query : checkAuthRoles');
		console.log('memberNicd:', authMember.memberNick);

		return `hi ${authMember.memberNick}, you are ${authMember.memberType} (memberId: ${authMember._id})`;
	}

	// Authenticated

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async updateMember(
		@Args('input') input: MemberUpdate,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Member> {
		console.log('Mutation: updateMember');
		// console.log('memberId', memberId);

		// Self-update must never change privileged fields; only ADMIN may
		// change these via updateMemberByAdmin.
		delete (input as Partial<MemberUpdate>)._id;
		delete (input as Partial<MemberUpdate>).memberType;
		delete (input as Partial<MemberUpdate>).memberStatus;

		return this.memberService.updateMember(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Members)
	public async getAgents(
		@Args('input') input: AgentsInquiry,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Members> {
		console.log('Query ,getAgents');
		return this.memberService.getAgents(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async likeTargetMember(
		@Args('memberId') input: string,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Member> {
		console.log('Mutation: likeTargetMember');
		const likeRefId = shapeIntoMongoObjectId(input);
		return await this.memberService.likeTargetMember(memberId, likeRefId);
	}

	//Admin

	@UseGuards(WithoutGuard)
	@Query(() => Member)
	public async getMember(
		@Args('memberId') input: string,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Member> {
		console.log('Query: getMember');
		const tergetId = shapeIntoMongoObjectId(input);

		return this.memberService.getMember(memberId, tergetId);
	}

	/** Admin  **/

	//Authorization

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(@Args('input') input: MembersInquiry): Promise<Members> {
		// console.log('authMember.memberType:', authMember.memberType);
		return await this.memberService.getAllMembersByAdmin(input);
	}

	//Authorization
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async updateMemberByAdmin(@Args('input') input: MemberUpdate): Promise<Member> {
		console.log('Mutation: updateMemberByAdmin');
		return await this.memberService.updateMemberByAdmin(input);
	}

	/**  UPLOADER **/

	@UseGuards(AuthGuard)
	@Mutation((returns) => String)
	public async imageUploader(
		@Args({ name: 'file', type: () => GraphQLUpload })
		{ createReadStream, filename, mimetype }: FileUpload,
		@Args('target') target: String,
	): Promise<string> {
		console.log('Mutation: imageUploader');

		if (!filename) throw new Error(Message.UPLOAD_FAILED);
		if (!isValidTarget(String(target))) throw new Error(Message.NOT_ALLOWED_REQUEST);
		if (!isValidImage(filename, mimetype)) throw new Error(Message.PROVIDE_ALLOWED_FORMAT);

		const imageName = getSerialForImage(filename);
		const url = `uploads/${target}/${imageName}`;
		ensureUploadDir(`uploads/${target}`);
		const stream = createReadStream();

		const result = await new Promise((resolve, reject) => {
			stream
				.pipe(createWriteStream(url))
				.on('finish', async () => resolve(true))
				.on('error', () => reject(false));
		});
		if (!result) throw new Error(Message.UPLOAD_FAILED);

		return url;
	}

	@UseGuards(AuthGuard)
	@Mutation((returns) => [String])
	public async imagesUploader(
		@Args('files', { type: () => [GraphQLUpload] })
		files: Promise<FileUpload>[],
		@Args('target') target: String,
	): Promise<string[]> {
		console.log('Mutation: imagesUploader');

		if (!isValidTarget(String(target))) throw new Error(Message.NOT_ALLOWED_REQUEST);

		const uploadedImages: string[] = [];
		// A rejected file used to be swallowed here and the caller received a
		// shorter list with no explanation, so picking an unsupported format
		// looked like the button simply did nothing. Failures are collected and
		// reported instead.
		const failures: string[] = [];

		const promisedList = files.map(async (img: Promise<FileUpload>, index: number): Promise<void> => {
			let name = `file ${index + 1}`;
			try {
				const { filename, mimetype, createReadStream } = await img;
				if (filename) name = filename;

				if (!isValidImage(filename, mimetype)) throw new Error(Message.PROVIDE_ALLOWED_FORMAT);

				const imageName = getSerialForImage(filename);
				const url = `uploads/${target}/${imageName}`;
				ensureUploadDir(`uploads/${target}`);
				const stream = createReadStream();

				await new Promise((resolve, reject) => {
					stream
						.pipe(createWriteStream(url))
						.on('finish', () => resolve(true))
						.on('error', (err) => reject(err));
				});

				uploadedImages[index] = url;
			} catch (err) {
				const reason = err instanceof Error ? err.message : Message.UPLOAD_FAILED;
				console.log('Error, imagesUploader:', name, reason);
				failures.push(`${name}: ${reason}`);
			}
		});

		await Promise.all(promisedList);

		// Partial success is still a failure to the agent, who picked all of them
		// on purpose; returning the survivors silently hides what was dropped.
		if (failures.length) throw new Error(failures.join(' · '));

		return uploadedImages;
	}

	/**
	 * Upload one .glb/.gltf model for a plant listing.
	 *
	 * Kept separate from imageUploader rather than widening its format list: the
	 * two have different callers, different size profiles and different accepted
	 * extensions, and loosening isValidImage would also loosen avatar and article
	 * uploads, which have no reason to accept binaries.
	 *
	 * AGENT and ADMIN only — a CLIENT has no listing to attach a model to.
	 * The 15MB ceiling comes from graphqlUploadExpress in main.ts.
	 */
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation((returns) => String)
	public async modelUploader(
		@Args({ name: 'file', type: () => GraphQLUpload })
		{ createReadStream, filename }: FileUpload,
		@Args('target') target: String,
	): Promise<string> {
		console.log('Mutation: modelUploader');

		if (!filename) throw new Error(Message.UPLOAD_FAILED);
		if (!isValidModelTarget(String(target))) throw new Error(Message.NOT_ALLOWED_REQUEST);
		if (!isValidModel(filename)) throw new Error(Message.PROVIDE_ALLOWED_MODEL_FORMAT);

		const modelName = getSerialForImage(filename);
		const url = `uploads/${target}/models/${modelName}`;
		ensureUploadDir(`uploads/${target}/models`);
		const stream = createReadStream();

		const result = await new Promise((resolve, reject) => {
			stream
				.pipe(createWriteStream(url))
				.on('finish', () => resolve(true))
				.on('error', () => reject(false));
		});
		if (!result) throw new Error(Message.UPLOAD_FAILED);

		return url;
	}
}
