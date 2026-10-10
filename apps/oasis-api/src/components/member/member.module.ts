import { Module } from '@nestjs/common';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schema/Member.model';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { LikeModule } from '../like/like.module';
import FollowSchema from '../../schema/Follow.model';
import { VerificationModule } from '../verification/verification.module';
import { AuthController } from '../auth/auth.controller';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		MongooseModule.forFeature([{ name: 'Follow', schema: FollowSchema }]),
		AuthModule,
		ViewModule,
		LikeModule,
		VerificationModule,
	],
	/*
	 * AuthController lives here rather than in AuthModule because it needs
	 * MemberService, and importing MemberModule from AuthModule would close a
	 * circle (MemberModule already imports AuthModule).
	 */
	controllers: [AuthController],
	providers: [MemberResolver, MemberService],
	exports: [MemberService],
})
export class MemberModule {}
