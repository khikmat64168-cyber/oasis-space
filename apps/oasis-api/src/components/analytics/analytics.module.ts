import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsResolver } from './analytics.resolver';
import { AnalyticsService } from './analytics.service';
import OrderItemSchema from '../../schema/OrderItem.model';
import MemberSchema from '../../schema/Member.model';
import PlantSchema from '../../schema/Plant.model';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'OrderItem', schema: OrderItemSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Plant', schema: PlantSchema },
		]),
		AuthModule,
	],
	providers: [AnalyticsResolver, AnalyticsService],
})
export class AnalyticsModule {}
