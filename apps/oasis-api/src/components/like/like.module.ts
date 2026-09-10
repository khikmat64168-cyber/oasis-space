import { Module } from '@nestjs/common';
import { LikeService } from './like.service';
import LikeSchema from '../../schema/Like.model';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Like', schema: LikeSchema }])],
	providers: [LikeService],
	exports: [LikeService],
})
export class LikeModule {}
