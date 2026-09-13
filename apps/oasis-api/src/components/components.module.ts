import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { PlantModule } from './plant/plant.module';
import { AccessoryModule } from './accessory/accessory.module';
import { OrderModule } from './order/order.module';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { FollowModule } from './follow/follow.module';
import { BoardArticleModule } from './board-article/board-article.module';

@Module({
	imports: [
		MemberModule,
		AuthModule,
		PlantModule,
		AccessoryModule,
		OrderModule,
		BoardArticleModule,
		CommentsModule,
		LikeModule,
		ViewModule,
		FollowModule,
	],
})
export class ComponentsModule {}
