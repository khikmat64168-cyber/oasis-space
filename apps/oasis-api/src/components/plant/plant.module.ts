import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlantResolver } from './plant.resolver';
import { PlantService } from './plant.service';
import PlantSchema from '../../schema/Plant.model';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { MemberModule } from '../member/member.module';
import { LikeModule } from '../like/like.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Plant', schema: PlantSchema }]),
		AuthModule,
		ViewModule,
		MemberModule,
		LikeModule,
	],
	providers: [PlantResolver, PlantService],
	exports: [PlantService],
})
export class PlantModule {}
