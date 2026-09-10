import { Module } from '@nestjs/common';
import CommentSchema from '../../schema/Comment.model';
import { CommentResolver } from '../comment/comment.resolver';
import { CommentService } from '../comment/comment.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { PlantModule } from '../plant/plant.module';
import { BoardArticleModule } from '../board-article/board-article.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Comment', schema: CommentSchema }]),
		AuthModule,
		MemberModule,
		PlantModule,
		BoardArticleModule,
	],
	providers: [CommentResolver, CommentService],
})
export class CommentsModule {}
