import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessoryResolver } from './accessory.resolver';
import { AccessoryService } from './accessory.service';
import AccessorySchema from '../../schema/Accessory.model';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { MemberModule } from '../member/member.module';
import { LikeModule } from '../like/like.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Accessory', schema: AccessorySchema }]),
		AuthModule,
		ViewModule,
		MemberModule,
		LikeModule,
	],
	providers: [AccessoryResolver, AccessoryService],
	exports: [AccessoryService],
})
export class AccessoryModule {}
