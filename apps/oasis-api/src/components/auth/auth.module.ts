import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { RefreshService } from './refresh.service';
import MemberSchema from '../../schema/Member.model';
import RefreshSessionSchema from '../../schema/RefreshSession.model';
import { ACCESS_TOKEN_TTL } from '../../libs/authConfig';

@Module({
	imports: [
		HttpModule,
		MongooseModule.forFeature([
			{ name: 'Member', schema: MemberSchema },
			{ name: 'RefreshSession', schema: RefreshSessionSchema },
		]),
		/*
		 * Was a flat 30 days. An access token that long, held in localStorage
		 * with no way to revoke it, was the single largest hole in the old
		 * design: anything that read it owned the account for a month. It is
		 * now minutes, and the refresh session carries the login instead.
		 */
		JwtModule.register({
			secret: `${process.env.SECRET_TOKEN}`,
			signOptions: { expiresIn: ACCESS_TOKEN_TTL },
		}),
	],
	providers: [AuthService, RefreshService],
	exports: [AuthService, RefreshService],
})
export class AuthModule {}
