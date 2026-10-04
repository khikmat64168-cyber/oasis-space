import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';
import NotificationSchema from '../../schema/Notification.model';
import MemberSchema from '../../schema/Member.model';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([
			{ name: 'Notification', schema: NotificationSchema },
			// read-only: used to find who the ADMIN copies go to
			{ name: 'Member', schema: MemberSchema },
		]), AuthModule],
	providers: [NotificationResolver, NotificationService],
	// OrderModule writes notifications from inside the order flow
	exports: [NotificationService],
})
export class NotificationModule {}
