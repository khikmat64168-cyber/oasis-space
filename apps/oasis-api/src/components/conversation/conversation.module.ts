import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationResolver } from './conversation.resolver';
import { ConversationService } from './conversation.service';
import ConversationSchema from '../../schema/Conversation.model';
import ConversationMessageSchema from '../../schema/ConversationMessage.model';
import MemberSchema from '../../schema/Member.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Conversation', schema: ConversationSchema },
			{ name: 'ConversationMessage', schema: ConversationMessageSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		NotificationModule,
	],
	providers: [ConversationResolver, ConversationService],
	exports: [ConversationService],
})
export class ConversationModule {}
