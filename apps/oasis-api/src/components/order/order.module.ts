import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderResolver } from './order.resolver';
import { OrderService } from './order.service';
import OrderSchema from '../../schema/Order.model';
import OrderItemSchema from '../../schema/OrderItem.model';
import PlantSchema from '../../schema/Plant.model';
import AccessorySchema from '../../schema/Accessory.model';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Order', schema: OrderSchema },
			{ name: 'OrderItem', schema: OrderItemSchema },
			{ name: 'Plant', schema: PlantSchema },
			{ name: 'Accessory', schema: AccessorySchema },
		]),
		AuthModule,
	],
	providers: [OrderResolver, OrderService],
	exports: [OrderService],
})
export class OrderModule {}
