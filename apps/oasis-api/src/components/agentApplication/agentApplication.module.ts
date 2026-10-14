import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AgentApplicationService } from './agentApplication.service';
import { AgentApplicationResolver } from './agentApplication.resolver';
import AgentApplicationSchema from '../../schema/AgentApplication.model';
import MemberSchema from '../../schema/Member.model';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'AgentApplication', schema: AgentApplicationSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		/*
		 * Same secret as the access token, as the phone-verification module
		 * already does: the tickets are told apart by their `purpose` claim,
		 * never by the key, so an access token presented to the status query
		 * is rejected and a status ticket is useless against AuthGuard.
		 */
		JwtModule.register({ secret: `${process.env.SECRET_TOKEN}` }),
		NotificationModule,
		AuthModule,
	],
	providers: [AgentApplicationService, AgentApplicationResolver],
	exports: [AgentApplicationService],
})
export class AgentApplicationModule {}
